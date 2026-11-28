#!/usr/bin/env python3
"""Inspect a PDF and render complete pages; requires pypdf/pdfplumber/Pillow/Poppler."""
import argparse
import json
import math
import re
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw
from pypdf import PdfReader
import pdfplumber


def fonts_in(resources, seen=None):
    seen = seen or set()
    found = []
    if not resources:
        return found
    resources = resources.get_object()
    font_map = resources.get('/Font', {})
    if hasattr(font_map, 'get_object'):
        font_map = font_map.get_object()
    for key, ref in font_map.items():
        font = ref.get_object()
        identity = str(font.get('/BaseFont', key))
        if identity in seen:
            continue
        seen.add(identity)
        faces = [font] + [face.get_object() for face in font.get('/DescendantFonts', [])]
        embedded = any(any(k in face.get('/FontDescriptor', {}).get_object() for k in ('/FontFile', '/FontFile2', '/FontFile3'))
                       for face in faces if face.get('/FontDescriptor'))
        glyph_programs = font.get('/CharProcs')
        if font.get('/Subtype') == '/Type3' and glyph_programs:
            embedded = all(bool(program.get_object().get_data()) for program in glyph_programs.get_object().values())
        found.append({'name': identity, 'subtype': str(font.get('/Subtype')), 'embedded': embedded,
                      'embeddingKind': 'glyph-programs' if font.get('/Subtype') == '/Type3' else 'font-file'})
    xobjects = resources.get('/XObject', {})
    if hasattr(xobjects, 'get_object'):
        xobjects = xobjects.get_object()
    for ref in xobjects.values():
        found.extend(fonts_in(ref.get_object().get('/Resources'), seen))
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--expected-pages', type=int)
    parser.add_argument('--expect-text', action='append', default=[])
    parser.add_argument('--mobile-pages', default='1', help='One-based comma-separated page numbers')
    parser.add_argument('--allow-no-links', action='store_true')
    parser.add_argument('--dpi', type=int, default=144)
    opt = parser.parse_args()
    pdf, out = opt.pdf.resolve(), opt.out.resolve()
    if not pdf.is_file():
        parser.error(f'PDF not found: {pdf}')
    if opt.dpi < 72:
        parser.error('--dpi must be at least 72')
    renderer = shutil.which('pdftoppm')
    if not renderer:
        parser.error('pdftoppm is required; install Poppler and put it on PATH')
    pages_dir, mobile_dir = out / 'pages', out / 'mobile'
    pages_dir.mkdir(parents=True, exist_ok=True)
    mobile_dir.mkdir(parents=True, exist_ok=True)
    reader = PdfReader(pdf)
    failures, pages, fonts, links = [], [], [], []
    text = '\n\n'.join(page.extract_text() or '' for page in reader.pages)
    (out / 'extracted-text.txt').write_text(text, encoding='utf-8')
    if opt.expected_pages is not None and len(reader.pages) != opt.expected_pages:
        failures.append(f'Expected {opt.expected_pages} pages, found {len(reader.pages)}')
    normalized_text = re.sub(r'\s+', '', text)
    for phrase in opt.expect_text:
        if re.sub(r'\s+', '', phrase) not in normalized_text:
            failures.append(f'Missing extracted phrase: {phrase}')
    with pdfplumber.open(pdf) as doc:
        for index, (page, pp) in enumerate(zip(reader.pages, doc.pages), 1):
            extracted = page.extract_text() or ''
            if len(extracted.strip()) < 20:
                failures.append(f'Page {index}: too little selectable text')
            outside = [char.get('text') for char in pp.chars if char['x0'] < -1 or char['x1'] > pp.width + 1 or char['top'] < -1 or char['bottom'] > pp.height + 1]
            if outside:
                failures.append(f'Page {index}: text outside page boundary')
            page_fonts = fonts_in(page.get('/Resources'))
            fonts.extend(page_fonts)
            pages.append({'page': index, 'widthPt': float(pp.width), 'heightPt': float(pp.height), 'selectableCharacters': len(extracted), 'outsideCharacters': outside, 'fonts': page_fonts})
            for ref in page.get('/Annots', []):
                annot = ref.get_object()
                if annot.get('/Subtype') == '/Link':
                    action = annot.get('/A', {})
                    links.append({'page': index, 'uri': str(action.get('/URI', '')), 'destination': str(annot.get('/Dest', action.get('/D', ''))), 'kind': str(action.get('/S', 'internal'))})
    fonts = list({font['name']: font for font in fonts}.values())
    if not fonts or any(not font['embedded'] for font in fonts):
        failures.append('Missing or unembedded PDF fonts')
    if not links and not opt.allow_no_links:
        failures.append('No PDF links; use --allow-no-links only when intentional')
    for link in links:
        if not link['uri'] and not link['destination']:
            failures.append(f'Page {link["page"]}: empty link annotation')
    # Clear only this helper's previous render outputs to avoid stale contact sheets.
    for old in pages_dir.glob('page-*.png'):
        old.unlink()
    subprocess.run([renderer, '-png', '-r', str(opt.dpi), str(pdf), str(pages_dir / 'page')], check=True, capture_output=True)
    rendered = sorted(pages_dir.glob('page-*.png'), key=lambda p: int(p.stem.split('-')[-1]))
    if len(rendered) != len(reader.pages):
        failures.append('Rendered page count does not match PDF')
    for index, file in enumerate(rendered, 1):
        target = pages_dir / f'page-{index:02d}.png'
        if file != target:
            file.rename(target)
    rendered = sorted(pages_dir.glob('page-*.png'), key=lambda p: int(p.stem.split('-')[-1]))
    cols, thumb_w, pad, label_h = 4, 280, 18, 28
    thumb_h = round(thumb_w * float(reader.pages[0].mediabox.height) / float(reader.pages[0].mediabox.width))
    contact = Image.new('RGB', (cols * (thumb_w + pad) + pad, math.ceil(len(rendered) / cols) * (thumb_h + label_h + pad) + pad), '#d6d6d6')
    draw = ImageDraw.Draw(contact)
    for index, file in enumerate(rendered):
        x, y = pad + (index % cols) * (thumb_w + pad), pad + (index // cols) * (thumb_h + label_h + pad)
        draw.text((x, y), f'Page {index + 1}', fill='#141618')
        with Image.open(file) as img:
            thumb = img.convert('RGB'); thumb.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
            contact.paste(thumb, (x, y + label_h))
    contact.save(out / 'contact-sheet.png')
    try:
        mobile_pages = sorted(set(int(value) for value in opt.mobile_pages.split(',')))
    except ValueError:
        parser.error('--mobile-pages must be comma-separated integers')
    for index in mobile_pages:
        if not 1 <= index <= len(rendered):
            parser.error(f'Mobile page {index} is outside PDF')
        with Image.open(rendered[index - 1]) as img:
            img = img.convert('RGB')
            img.resize((390, round(img.height * 390 / img.width)), Image.Resampling.LANCZOS).save(mobile_dir / f'page-{index:02d}-390.png')
            # A central column at ~2x the full-page scale models reading after zoom.
            crop = img.crop((img.width * .17, img.height * .18, img.width * .83, img.height * .68))
            crop.resize((390, round(crop.height * 390 / crop.width)), Image.Resampling.LANCZOS).save(mobile_dir / f'page-{index:02d}-detail-390.png')
    warnings = ['Type3 glyph programs found: verify text selection, spaces, glyphs and viewer compatibility.'] if any(font['subtype'] == '/Type3' for font in fonts) else []
    result = {'pdf': str(pdf), 'pageCount': len(pages), 'pages': pages, 'fonts': fonts, 'links': links, 'warnings': warnings, 'failures': failures, 'automaticChecksPassed': not failures,
              'visualReviewRequired': True, 'contactSheet': str(out / 'contact-sheet.png'), 'mobilePages': mobile_pages}
    (out / 'qa.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'pages': len(pages), 'fontsEmbedded': all(font['embedded'] for font in fonts), 'links': len(links), 'failures': failures, 'out': str(out)}, ensure_ascii=False))
    raise SystemExit(1 if failures else 0)


if __name__ == '__main__':
    main()
