import React from "react";
import "./Graph.css";

const NodeInfoPopup = ({ node, onClose }) => {
  if (!node || !node.id) return null;

  return (
    <div className="node-info-popup">
      <div className="node-info-header">
        <h3>{node.label || node.id}</h3>
        <button onClick={onClose}>×</button>
      </div>
      <div className="node-info-content">
        <p>
          <strong>ID:</strong> {node.id}
        </p>
        {node.size !== undefined && (
          <p>
            <strong>Size:</strong> {node.size.toFixed(2)}
          </p>
        )}
        {node.x !== undefined && node.y !== undefined && (
          <p>
            <strong>Position:</strong> ({node.x.toFixed(2)}, {node.y.toFixed(2)}
            )
          </p>
        )}
        {node.isCluster && node.nodes && (
          <p>
            <strong>Nodes in cluster:</strong> {node.nodes.length}
          </p>
        )}
        {node.color && (
          <div
            className="color-preview"
            style={{ backgroundColor: node.color }}
            title={node.color}
          />
        )}

        {/* Connected Nodes Section */}
        {node.connectedNodes && node.connectedNodes.length > 0 && (
          <div className="connected-nodes-section">
            <h4>Connected Nodes ({node.connectedNodes.length})</h4>
            <div className="connected-nodes-list">
              {node.connectedNodes.map(
                (connNode) =>
                  connNode &&
                  connNode.id && (
                    <div key={connNode.id} className="connected-node-item">
                      <div>
                        <p>
                          <strong>ID:</strong> {connNode.id}
                        </p>
                        <p>
                          <strong>Label:</strong>{" "}
                          {connNode.label || connNode.id}
                        </p>
                      </div>
                      {connNode.color && (
                        <div
                          className="color-preview small"
                          style={{ backgroundColor: connNode.color }}
                          title={connNode.color}
                        />
                      )}
                    </div>
                  )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NodeInfoPopup;
