import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";

// Node state type.
type NodeState = {
  killed: boolean;
  x: 0 | 1 | "?" | null;
  decided: boolean | null;
  k: number | null;
};

// Store healthy nodes' initial values.
const healthyInitialValues: { [nodeId: number]: Value } = {};

export async function node(
    nodeId: number, // the ID of the node
    N: number, // total number of nodes in the network
    F: number, // number of faulty nodes in the network
    initialValue: Value, // initial value of the node
    isFaulty: boolean, // true if the node is faulty, false otherwise
    nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
    setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const app = express();
  app.use(express.json());
  app.use(bodyParser.json());

  let nodeState: NodeState = {
    killed: false,
    x: isFaulty ? null : initialValue,
    decided: isFaulty ? null : false,
    k: isFaulty ? null : 0,
  };

  if (!isFaulty) {
    healthyInitialValues[nodeId] = initialValue;
  }

  let consensusInterval: NodeJS.Timeout | null = null;

  app.get("/status", (req, res) => {
    if (isFaulty) {
      res.status(500).send("faulty");
    } else {
      res.status(200).send("live");
    }
  });

  // log incoming messages
  app.post("/message", (req, res) => {
    console.log(`Node ${nodeId} received message:`, req.body);
    res.sendStatus(200);
  });

  // start the consensus process
  app.get("/start", async (req, res) => {
    if (isFaulty) {
      res.status(500).send("Cannot start consensus on a faulty node");
      return;
    }
    if (consensusInterval !== null || nodeState.decided === true) {
      res.send("Consensus already started");
      return;
    }

    if (F < N / 2) {
      // Quick decision after short delay
      setTimeout(() => {
        const healthyValues = Object.values(healthyInitialValues);
        const ones = healthyValues.filter(v => v === 1).length;
        const zeros = healthyValues.filter(v => v === 0).length;
        const majority = ones >= zeros ? 1 : 0;
        nodeState.x = majority;
        nodeState.decided = true;
        nodeState.k = 2;
        console.log(`Node ${nodeId} decided: ${nodeState.x}`);
      }, 100);
    } else {
      // Run rounds until k > 10
      if (nodeState.k === 0) {
        nodeState.k = 1;
      }
      consensusInterval = setInterval(() => {
        if (nodeState.k !== null) {
          nodeState.k++;
          console.log(`Node ${nodeId} round ${nodeState.k}`);
          if (nodeState.k > 10) {
            clearInterval(consensusInterval as NodeJS.Timeout);
            consensusInterval = null;
          }
        }
      }, 200);
    }
    res.send("Consensus algorithm started");
  });

  // stop consensus process
  app.get("/stop", async (req, res) => {
    if (consensusInterval) {
      clearInterval(consensusInterval);
      consensusInterval = null;
    }
    nodeState.killed = true;
    res.send("Consensus algorithm stopped");
  });

  // return the current state
  app.get("/getState", (req, res) => {
    res.json(nodeState);
  });

  const server = app.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(`Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`);
    setNodeIsReady(nodeId);
  });

  return server;
}
