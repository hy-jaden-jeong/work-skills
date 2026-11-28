// Single source of facts. Fictional example; no personal data.
window.GRAPH_FACTS = {
  "people": ["Alice", "Bob", "Claire", "Dan", "Eve", "Fay"],
  "personType": "Person",
  "relation": "FRIENDS_WITH",
  "symmetric": true,
  "friendships": [["Alice","Bob"],["Alice","Claire"],["Bob","Dan"],["Bob","Eve"],["Claire","Eve"],["Claire","Fay"]],
  "query": {"start":"Alice", "hops":2, "excludeStart":true, "distinct":true}
};
