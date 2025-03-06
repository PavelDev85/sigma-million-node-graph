import React, { useEffect, useRef, useState, useCallback } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import graphData from "../data/graph.json";
import NodeInfoPopup from "./NodeInfoPopup";
import "./Graph.css";

// Validate and process the imported data
console.log("Raw graph data:", graphData);

const processedData = {
  nodes: Array.isArray(graphData.nodes) ? graphData.nodes : [],
  edges: Array.isArray(graphData.edges) ? graphData.edges : [],
};

console.log("Processed graph data:", {
  nodesCount: processedData.nodes.length,
  edgesCount: processedData.edges.length,
  sampleNode: processedData.nodes[0],
  sampleEdge: processedData.edges[0],
});

const GraphComponent = () => {
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  const rendererRef = useRef(null);
  const workerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [viewportNodes, setViewportNodes] = useState(new Set());
  const [cameraAngle, setCameraAngle] = useState(0);
  const [sampleSettings, setSampleSettings] = useState({
    nodeLimit: 1000,
    edgeLimit: 10000,
    importantNodesPercent: 20,
  });
  const [isRendererActive, setIsRendererActive] = useState(true);
  const [containerKey, setContainerKey] = useState(0);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // Check if a node is in the current viewport
  const isInViewport = (position, camera) => {
    const margin = 100;
    return (
      position.x >= -margin &&
      position.x <= camera.width + margin &&
      position.y >= -margin &&
      position.y <= camera.height + margin
    );
  };

  // Handle camera movement for viewport-based rendering
  const handleCameraMove = useCallback(() => {
    if (!rendererRef.current) return;

    const camera = rendererRef.current.getCamera();
    const viewportNodes = new Set();

    graphRef.current.forEachNode((node, attributes) => {
      const nodePosition = rendererRef.current.graphToViewport(attributes);
      if (isInViewport(nodePosition, camera)) {
        viewportNodes.add(node);
      }
    });

    setViewportNodes(viewportNodes);

    // Enhanced LOD based on zoom level
    if (camera.ratio > 5) {
      workerRef.current.postMessage({
        type: "CLUSTER_DATA",
        data: Array.from(viewportNodes).map((id) =>
          graphRef.current.getNodeAttributes(id)
        ),
      });
      rendererRef.current.setSetting("renderLabels", false);
    } else if (camera.ratio > 2) {
      rendererRef.current.setSetting("renderLabels", true);
      rendererRef.current.setSetting("labelRenderedSizeThreshold", 15);
      rendererRef.current.setSetting("nodeReducer", (node, data) => ({
        ...data,
        label: data.isCluster ? data.label : "",
        size: data.size * 0.8,
      }));
    } else {
      rendererRef.current.setSetting("renderLabels", true);
      rendererRef.current.setSetting("labelRenderedSizeThreshold", 8);
      rendererRef.current.setSetting("nodeReducer", (node, data) => ({
        ...data,
        size: data.size,
      }));
    }

    rendererRef.current.refresh();
  }, []);

  // Handle click events for cluster expansion
  const handleClick = useCallback((event) => {
    if (!graphRef.current || !rendererRef.current) return;

    try {
      const node = event.node;
      if (!node) return;

      const nodeAttributes = graphRef.current.getNodeAttributes(node);
      if (!nodeAttributes) return;

      const connectedNodes = [];
      try {
        graphRef.current.forEachNeighbor(node, (neighbor, attributes) => {
          if (neighbor && attributes) {
            connectedNodes.push({
              id: neighbor,
              ...attributes,
            });
          }
        });
      } catch (error) {
        console.error("Error getting neighbors:", error);
      }

      const selectedNodeInfo = {
        id: node,
        ...nodeAttributes,
        connectedNodes: connectedNodes,
      };

      setSelectedNode(selectedNodeInfo);
      console.log("Selected node info:", selectedNodeInfo);

      try {
        graphRef.current.forEachEdge((edge) => {
          if (edge) {
            graphRef.current.updateEdgeAttributes(edge, (attr) => ({
              ...attr,
              color: "#ccc",
              size: 1,
            }));
          }
        });

        const connectedEdges = graphRef.current.edges(node);
        console.log("Connected edges:", connectedEdges);

        connectedEdges.forEach((edge) => {
          if (edge) {
            graphRef.current.updateEdgeAttributes(edge, (attr) => ({
              ...attr,
              color: "#4287f5",
              size: 2,
            }));
          }
        });
      } catch (error) {
        console.error("Error updating edges:", error);
      }

      if (nodeAttributes.isCluster) {
        try {
          graphRef.current.dropNode(node);
          nodeAttributes.nodes.forEach((n) => {
            if (n && n.id) {
              graphRef.current.addNode(n.id, {
                ...n,
                size: n.size * 2,
              });
            }
          });
        } catch (error) {
          console.error("Error handling cluster:", error);
        }
      }

      if (rendererRef.current) {
        rendererRef.current.refresh();
      }
    } catch (error) {
      console.error("Error in handleClick:", error);
    }
  }, []);

  // Update clusters when received from worker
  const updateClusters = useCallback((clusters) => {
    if (!graphRef.current || !rendererRef.current) return;

    graphRef.current.clear();

    clusters.nodes.forEach((cluster) => {
      graphRef.current.addNode(cluster.id, {
        x: cluster.x,
        y: cluster.y,
        size: Math.sqrt(cluster.nodes.length) * 5,
        color: cluster.color,
        label: `Cluster (${cluster.nodes.length})`,
        isCluster: true,
        nodes: cluster.nodes,
      });
    });

    rendererRef.current.refresh();
  }, []);

  // Initialize graph directly without worker for small datasets
  const initializeGraphDirectly = useCallback(
    (data) => {
      if (!containerRef.current || !isMounted) {
        console.error("Container element not ready");
        return;
      }

      console.log("Initializing graph directly with data:", {
        nodes: data.nodes.length,
        edges: data.edges.length,
      });

      try {
        const graph = new Graph();
        graphRef.current = graph;

        data.nodes.forEach((node) => {
          graph.addNode(node.id, {
            x: node.x,
            y: node.y,
            size: node.size || 5,
            color: node.color || "#6c757d",
            label: node.label || node.id.toString(),
          });
        });

        data.edges.forEach((edge) => {
          if (!graph.hasEdge(edge.source, edge.target)) {
            graph.addEdge(edge.source, edge.target, {
              color: edge.color || "#ccc",
              size: edge.size || 1,
              type: "arrow",
              label: edge.label || "",
              forceLabel: true,
            });
          }
        });

        rendererRef.current = new Sigma(graph, containerRef.current, {
          minCameraRatio: 0.01,
          maxCameraRatio: 200,
          renderLabels: true,
          labelRenderedSizeThreshold: 1,
          hideEdgesOnMove: true,
          webGLEnabled: true,
          allowInvalidContainer: true,
          defaultNodeColor: "#6c757d",
          defaultEdgeColor: "#ccc",
          defaultNodeSize: 5,
          defaultEdgeSize: 1,
          defaultLabelSize: 14,
          labelSize: 14,
          labelWeight: "bold",
          renderEdgeArrows: true,
          edgeArrowSize: 6,
        });

        rendererRef.current.on("cameraMoved", handleCameraMove);
        rendererRef.current.on("clickNode", handleClick);

        const camera = rendererRef.current.getCamera();
        camera.ratio = 1.5;
        camera.angle = 0;
        camera.x = 0.5;
        camera.y = 0.5;
        rendererRef.current.refresh();

        setIsLoading(false);
        console.log("Graph initialization complete");
      } catch (error) {
        console.error("Failed to initialize Sigma:", error);
        setIsLoading(false);
      }
    },
    [handleCameraMove, handleClick, isMounted]
  );

  // Handle worker messages
  const handleWorkerMessage = useCallback(
    (event) => {
      const { type, data } = event.data;
      console.log("Received message from worker:", type);

      switch (type) {
        case "SAMPLED_DATA":
          console.log("Initializing graph with sampled data");
          setIsRendererActive(true);
          initializeGraphDirectly(data);
          break;
        case "CLUSTERED_DATA":
          console.log("Updating clusters");
          setIsRendererActive(true);
          updateClusters(data);
          break;
        default:
          console.warn("Unknown message type:", type);
      }
    },
    [initializeGraphDirectly, updateClusters]
  );

  // Add wheel event handler for shift+scroll
  const handleWheel = useCallback((event) => {
    if (!rendererRef.current || !event.shiftKey) return;

    event.preventDefault();
    const camera = rendererRef.current.getCamera();
    const newAngle = camera.angle - event.deltaY / 500;
    camera.angle = newAngle;
    setCameraAngle(newAngle);
    rendererRef.current.refresh();
  }, []);

  // Add slider change handler
  const handleAngleChange = useCallback((event) => {
    if (!rendererRef.current) return;

    const newAngle = parseFloat(event.target.value);
    const camera = rendererRef.current.getCamera();
    camera.angle = newAngle;
    setCameraAngle(newAngle);
    rendererRef.current.refresh();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener("wheel", handleWheel);
      return () => container.removeEventListener("wheel", handleWheel);
    }
  }, [handleWheel]);

  const handleSampleSettingsChange = useCallback((event) => {
    const { name, value } = event.target;
    setSampleSettings((prev) => ({
      ...prev,
      [name]: parseInt(value, 10),
    }));
  }, []);

  // Modify the applySampling function
  const applySampling = useCallback(() => {
    setIsLoading(true);
    setSelectedNode(null);

    setContainerKey((prev) => prev + 1);

    Promise.resolve().then(() => {
      try {
        if (rendererRef.current) {
          rendererRef.current.removeAllListeners();
          rendererRef.current.kill();
          rendererRef.current = null;
        }
        if (graphRef.current) {
          graphRef.current.clear();
          graphRef.current = null;
        }

        if (processedData.nodes.length > 0) {
          workerRef.current.postMessage({
            type: "SAMPLE_DATA",
            data: {
              nodes: processedData.nodes,
              edges: processedData.edges,
            },
            settings: sampleSettings,
          });
        }
      } catch (error) {
        console.warn("Cleanup error:", error);
      }
    });
  }, [sampleSettings]);

  useEffect(() => {
    if (!isMounted || !containerRef.current) {
      return;
    }

    console.log("Starting initialization...");

    if (!processedData.nodes.length) {
      console.error("No valid data to process");
      setIsLoading(false);
      return;
    }

    if (processedData.nodes.length < 1000) {
      console.log("Small dataset detected, initializing directly");
      initializeGraphDirectly(processedData);
      return;
    }

    console.log("Large dataset detected, initializing worker");
    try {
      workerRef.current = new Worker(
        new URL("../workers/graphWorker.js", import.meta.url)
      );
      workerRef.current.onmessage = handleWorkerMessage;

      console.log("Sending data to worker:", {
        nodes: processedData.nodes.length,
        edges: processedData.edges.length,
      });

      workerRef.current.postMessage({
        type: "SAMPLE_DATA",
        data: {
          nodes: processedData.nodes,
          edges: processedData.edges,
        },
      });
    } catch (error) {
      console.error("Worker initialization failed:", error);
      initializeGraphDirectly(processedData);
    }

    return () => {
      setIsRendererActive(false);
      setSelectedNode(null);

      setTimeout(() => {
        try {
          if (rendererRef.current) {
            rendererRef.current.removeAllListeners();
            rendererRef.current.kill();
            rendererRef.current = null;
          }
          if (workerRef.current) {
            workerRef.current.terminate();
          }
        } catch (error) {
          console.warn("Cleanup error during unmount:", error);
        }
      }, 0);
    };
  }, [handleWorkerMessage, initializeGraphDirectly, isMounted]);

  return (
    <>
      <div className="sampling-controls">
        <h3>Sampling Settings</h3>
        <div className="sampling-form">
          <div className="form-group">
            <label>
              Max Nodes:
              <input
                type="number"
                name="nodeLimit"
                value={sampleSettings.nodeLimit}
                onChange={handleSampleSettingsChange}
                min="100"
                max="10000"
              />
            </label>
          </div>
          <div className="form-group">
            <label>
              Max Edges:
              <input
                type="number"
                name="edgeLimit"
                value={sampleSettings.edgeLimit}
                onChange={handleSampleSettingsChange}
                min="100"
                max="20000"
              />
            </label>
          </div>
          <div className="form-group">
            <label>
              Important Nodes %:
              <input
                type="number"
                name="importantNodesPercent"
                value={sampleSettings.importantNodesPercent}
                onChange={handleSampleSettingsChange}
                min="1"
                max="100"
              />
            </label>
          </div>
          <button onClick={applySampling} className="apply-button">
            Apply Sampling
          </button>
        </div>
      </div>

      <div
        key={containerKey}
        ref={containerRef}
        className="graph-container"
        style={{
          height: "100vh",
          width: "100%",
          position: "relative",
          backgroundColor: "#fff",
          border: "1px solid #ddd",
          borderRadius: "4px",
        }}
      >
        <div className="camera-controls">
          <label>
            Rotation:
            <input
              type="range"
              min="-Math.PI"
              max="Math.PI"
              step="0.01"
              value={cameraAngle}
              onChange={handleAngleChange}
            />
          </label>
        </div>

        {isLoading && (
          <div className="loading-container">
            Loading and processing graph data...
          </div>
        )}
      </div>

      {/* Render NodeInfoPopup outside the graph container */}
      {selectedNode && (
        <NodeInfoPopup
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </>
  );
};

export default GraphComponent;
