/* eslint-disable no-restricted-globals */

// Make sure we're in a worker context
const ctx = self;

// Handle messages from the main thread
ctx.onmessage = async (event) => {
  const { type, data, settings } = event.data;
  console.log("Worker received message:", type, {
    hasData: !!data,
    nodesCount: data?.nodes?.length,
    edgesCount: data?.edges?.length,
  });

  if (
    !data ||
    !data.nodes ||
    !Array.isArray(data.nodes) ||
    data.nodes.length === 0
  ) {
    console.error("Invalid or empty data received:", data);
    ctx.postMessage({ type: "ERROR", message: "Invalid data format" });
    return;
  }

  // Validate node data structure
  const isValidNode = (node) => {
    return (
      node &&
      typeof node === "object" &&
      typeof node.x === "number" &&
      typeof node.y === "number" &&
      node.id !== undefined
    );
  };

  const validNodes = data.nodes.filter(isValidNode);
  console.log(
    `Found ${validNodes.length} valid nodes out of ${data.nodes.length} total nodes`
  );

  if (validNodes.length === 0) {
    ctx.postMessage({ type: "ERROR", message: "No valid nodes found in data" });
    return;
  }

  switch (type) {
    case "SAMPLE_DATA":
      console.log("Sampling data with settings:", settings);
      const sampledNodes = sampleNodes(
        validNodes,
        settings?.nodeLimit || 10000,
        settings?.importantNodesPercent || 20
      );
      const sampledEdges = sampleEdges(
        data.edges,
        sampledNodes,
        settings?.edgeLimit || 10000
      );
      console.log("Sampled data size:", {
        nodes: sampledNodes.length,
        edges: sampledEdges.length,
      });
      ctx.postMessage({
        type: "SAMPLED_DATA",
        data: {
          nodes: sampledNodes,
          edges: sampledEdges,
        },
      });
      break;

    case "CLUSTER_DATA":
      console.log("Clustering data...");
      const clusters = clusterNodes(validNodes);
      console.log("Created clusters:", clusters.length);
      ctx.postMessage({
        type: "CLUSTERED_DATA",
        data: {
          nodes: clusters,
          edges: [],
        },
      });
      break;

    default:
      ctx.postMessage({ type: "ERROR", message: "Unknown message type" });
  }
};

// Sample nodes based on degree and random selection
function sampleNodes(nodes, sampleSize, importantPercent) {
  if (nodes.length <= sampleSize) {
    console.log("Data size smaller than sample size, returning all nodes");
    return nodes;
  }

  // Sort nodes by degree (if you have edge data) or size
  const sortedNodes = nodes.sort((a, b) => (b.size || 1) - (a.size || 1));

  // Take top percentage of important nodes
  const importantNodesCount = Math.floor(sampleSize * (importantPercent / 100));
  const importantNodes = sortedNodes.slice(0, importantNodesCount);

  // Randomly sample the rest
  const remainingNodes = sortedNodes.slice(importantNodesCount);
  const randomNodes = [];
  const remainingCount = sampleSize - importantNodesCount;

  for (let i = 0; i < remainingCount && remainingNodes.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * remainingNodes.length);
    randomNodes.push(remainingNodes[randomIndex]);
    remainingNodes.splice(randomIndex, 1);
  }

  const result = [...importantNodes, ...randomNodes];
  console.log("Sampling complete:", result.length, "nodes");
  return result;
}

// Grid-based clustering implementation
function clusterNodes(nodes) {
  const GRID_SIZE = 50;
  const clusters = new Map();

  nodes.forEach((node) => {
    const gridX = Math.floor(node.x / GRID_SIZE);
    const gridY = Math.floor(node.y / GRID_SIZE);
    const key = `${gridX},${gridY}`;

    if (!clusters.has(key)) {
      clusters.set(key, {
        id: key,
        x: (gridX + 0.5) * GRID_SIZE,
        y: (gridY + 0.5) * GRID_SIZE,
        size: 0,
        color: node.color,
        nodes: [],
      });
    }

    const cluster = clusters.get(key);
    cluster.nodes.push(node);
    cluster.size += node.size || 1;
  });

  return Array.from(clusters.values());
}

function sampleEdges(edges, sampledNodes, maxEdges = 10000) {
  // Create a Set of sampled node IDs for faster lookup
  const sampledNodeIds = new Set(sampledNodes.map((n) => n.id));

  // Filter valid edges (those connecting sampled nodes)
  const validEdges = edges.filter(
    (edge) => sampledNodeIds.has(edge.source) && sampledNodeIds.has(edge.target)
  );

  // If we have fewer edges than max, return all valid edges
  if (validEdges.length <= maxEdges) return validEdges;

  // Sort edges by weight/importance if available, or take a random sample
  return validEdges
    .sort((a, b) => (b.weight || 1) - (a.weight || 1))
    .slice(0, maxEdges);
}
