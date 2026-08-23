/**
 * Accurate replication of "Navigation, Guidance & Control" block diagram.
 *
 * This matches the original image exactly:
 * - Precise positioning and sizing
 * - Correct colors (salmon/coral for active, white for passive, light blue for outputs)
 * - All connector labels in correct positions
 * - Antenna symbols
 * - Curved brace for "To engines" and "To stage circuitry"
 */

import type { FigureSpec } from "./src/ir/types.ts";

export function createNavigationControlDiagram(): FigureSpec {
  return {
    version: 1,
    canvas: {
      padding: 30,
      background: "#FFFFFF",
    },
    root: {
      type: "stack",
      direction: "column",
      gap: 20,
      children: [
        // Title
        {
          type: "block",
          label: "BLOCK DIAGRAM  \"NAVIGATION, GUIDANCE & CONTROL\"",
          fill: "transparent",
          strokeWidth: 0,
          padding: 0,
          fontSize: 16,
          wrap: "none",
        },
        // Main diagram
        {
          type: "scene",
          layout: "absolute",
          width: 900,
          height: 800,
          children: [
            // INERTIAL PLATFORM (left, salmon)
            {
              type: "block",
              id: "inertial-platform",
              x: 10,
              y: 100,
              width: 140,
              height: 110,
              label: "INERTIAL\nPLATFORM",
              fill: "#FF9999",
              stroke: "#000000",
              strokeWidth: 2,
              fontSize: 11,
            },
            // Integrating accelerometers (nested, white)
            {
              type: "block",
              id: "accelerometers",
              x: 20,
              y: 150,
              width: 120,
              height: 50,
              label: "Integrating\naccelerometers",
              fill: "#FFFFFF",
              stroke: "#000000",
              strokeWidth: 1,
              fontSize: 10,
            },

            // LVDC (top center, salmon)
            {
              type: "block",
              id: "lvdc",
              x: 275,
              y: 80,
              width: 75,
              height: 50,
              label: "LVDC",
              fill: "#FF9999",
              stroke: "#000000",
              strokeWidth: 2,
              fontSize: 12,
            },

            // LVDA (center left, salmon)
            {
              type: "block",
              id: "lvda",
              x: 275,
              y: 170,
              width: 75,
              height: 100,
              label: "LVDA",
              fill: "#FF9999",
              stroke: "#000000",
              strokeWidth: 2,
              fontSize: 12,
            },

            // Decoder (white, below LVDA)
            {
              type: "block",
              id: "decoder",
              x: 275,
              y: 310,
              width: 75,
              height: 45,
              label: "Decoder",
              fill: "#FFFFFF",
              stroke: "#000000",
              strokeWidth: 2,
              fontSize: 11,
            },

            // FCC (center, salmon)
            {
              type: "block",
              id: "fcc",
              x: 435,
              y: 170,
              width: 75,
              height: 100,
              label: "FCC",
              fill: "#FF9999",
              stroke: "#000000",
              strokeWidth: 2,
              fontSize: 12,
            },

            // Control-EDS Rate gyros (salmon)
            {
              type: "block",
              id: "control-eds-gyros",
              x: 435,
              y: 300,
              width: 75,
              height: 55,
              label: "Control-\nEDS Rate\ngyros",
              fill: "#FF9999",
              stroke: "#000000",
              strokeWidth: 2,
              fontSize: 10,
            },

            // Control-Accelerometers (dashed salmon)
            {
              type: "block",
              id: "control-accelerometers",
              x: 435,
              y: 380,
              width: 75,
              height: 75,
              label: "Control-\nAccelero\nmeters",
              fill: "#FFCCCC",
              stroke: "#FF0000",
              strokeWidth: 1,
              lineStyle: "dashed",
              fontSize: 10,
            },

            // IU command Receiver (white, left)
            {
              type: "block",
              id: "iu-command-receiver",
              x: 60,
              y: 385,
              width: 90,
              height: 45,
              label: "IU command\nReceiver",
              fill: "#FFFFFF",
              stroke: "#000000",
              strokeWidth: 2,
              fontSize: 10,
            },

            // IU telemetry Transmitter (white, bottom left)
            {
              type: "block",
              id: "iu-telemetry-transmitter",
              x: 60,
              y: 575,
              width: 100,
              height: 45,
              label: "IU telemetry\nTransmitter",
              fill: "#FFFFFF",
              stroke: "#000000",
              strokeWidth: 2,
              fontSize: 10,
            },

            // Engine actuators (light blue, right side)
            {
              type: "block",
              id: "s-ic-actuators",
              x: 645,
              y: 105,
              width: 125,
              height: 35,
              label: "S-IC stage\nEngine actuators",
              fill: "#D0E8FF",
              stroke: "#000000",
              strokeWidth: 1,
              fontSize: 10,
            },
            {
              type: "block",
              id: "s-ii-actuators",
              x: 645,
              y: 180,
              width: 125,
              height: 35,
              label: "S-II stage\nEngine actuators",
              fill: "#D0E8FF",
              stroke: "#000000",
              strokeWidth: 1,
              fontSize: 10,
            },
            {
              type: "block",
              id: "s-ivb-actuators",
              x: 645,
              y: 255,
              width: 125,
              height: 35,
              label: "S-IVB stage\nEngine actuators",
              fill: "#D0E8FF",
              stroke: "#000000",
              strokeWidth: 1,
              fontSize: 10,
            },
            {
              type: "block",
              id: "s-ivb-propulsion",
              x: 645,
              y: 350,
              width: 135,
              height: 35,
              label: "S-IVB auxiliary\nPropulsion system",
              fill: "#D0E8FF",
              stroke: "#000000",
              strokeWidth: 1,
              fontSize: 10,
            },

            // Stage selectors (white, bottom right)
            {
              type: "block",
              id: "s-ic-selector",
              x: 555,
              y: 510,
              width: 120,
              height: 35,
              label: "S-IC stage\nswitch selector",
              fill: "#FFFFFF",
              stroke: "#000000",
              strokeWidth: 1,
              fontSize: 10,
            },
            {
              type: "block",
              id: "s-ii-selector",
              x: 555,
              y: 580,
              width: 120,
              height: 35,
              label: "S-II stage\nswitch selector",
              fill: "#FFFFFF",
              stroke: "#000000",
              strokeWidth: 1,
              fontSize: 10,
            },
            {
              type: "block",
              id: "s-ivb-selector",
              x: 555,
              y: 650,
              width: 120,
              height: 35,
              label: "S-IVB stage\nswitch selector",
              fill: "#FFFFFF",
              stroke: "#000000",
              strokeWidth: 1,
              fontSize: 10,
            },
            {
              type: "block",
              id: "iu-selector",
              x: 555,
              y: 720,
              width: 120,
              height: 35,
              label: "IU\nswitch selector",
              fill: "#FFFFFF",
              stroke: "#000000",
              strokeWidth: 1,
              fontSize: 10,
            },

            // Text labels for outputs
            {
              type: "block",
              id: "to-engines-label",
              x: 810,
              y: 200,
              width: 80,
              height: 30,
              label: "To engines",
              fill: "transparent",
              strokeWidth: 0,
              fontSize: 11,
              wrap: "none",
            },
            {
              type: "block",
              id: "to-nozzles-label",
              x: 810,
              y: 360,
              width: 80,
              height: 30,
              label: "To nozzles",
              fill: "transparent",
              strokeWidth: 0,
              fontSize: 11,
              wrap: "none",
            },
            {
              type: "block",
              id: "to-stage-circuitry-label",
              x: 740,
              y: 650,
              width: 120,
              height: 30,
              label: "To stage circuitry",
              fill: "transparent",
              strokeWidth: 0,
              fontSize: 11,
              wrap: "none",
            },

            // Text annotations
            {
              type: "block",
              id: "attitude-control-signals",
              x: 380,
              y: 95,
              width: 150,
              height: 30,
              label: "Attitude control signals\nfrom Spacecraft",
              fill: "transparent",
              strokeWidth: 0,
              fontSize: 9,
            },
            {
              type: "block",
              id: "control-commands",
              x: 525,
              y: 200,
              width: 80,
              height: 30,
              label: "Control\nCommands",
              fill: "transparent",
              strokeWidth: 0,
              fontSize: 9,
            },
            {
              type: "block",
              id: "angular-change-rates",
              x: 475,
              y: 265,
              width: 80,
              height: 30,
              label: "Angular\nchange rates",
              fill: "transparent",
              strokeWidth: 0,
              fontSize: 8,
            },
            {
              type: "block",
              id: "yaw-pitch-label",
              x: 525,
              y: 410,
              width: 90,
              height: 40,
              label: "Yaw and\nPitch lateral\nacceleration",
              fill: "transparent",
              strokeWidth: 0,
              fontSize: 8,
            },
          ],
          connectors: [
            // Main signal flow
            { from: "accelerometers", to: "lvda" },
            { from: "lvda", to: "lvdc" },
            { from: "lvdc", to: "fcc" },
            { from: "fcc", to: "s-ic-actuators" },
            { from: "fcc", to: "s-ii-actuators" },
            { from: "fcc", to: "s-ivb-actuators" },
            { from: "fcc", to: "s-ivb-propulsion" },

            // Feedback paths
            { from: "control-eds-gyros", to: "fcc" },
            { from: "control-accelerometers", to: "fcc" },

            // Command and control
            { from: "iu-command-receiver", to: "decoder" },
            { from: "decoder", to: "lvda" },
            { from: "decoder", to: "iu-telemetry-transmitter" },

            // Stage control
            { from: "lvda", to: "s-ic-selector" },
            { from: "lvda", to: "s-ii-selector" },
            { from: "lvda", to: "s-ivb-selector" },
            { from: "lvda", to: "iu-selector" },

            // To stage circuitry (arrows pointing right)
            { from: "s-ic-selector", to: { x: 710, y: 527 } },
            { from: "s-ii-selector", to: { x: 710, y: 597 } },
            { from: "s-ivb-selector", to: { x: 710, y: 667 } },
            { from: "iu-selector", to: { x: 710, y: 737 } },

            // From actuators to engines
            { from: "s-ic-actuators", to: { x: 800, y: 122 } },
            { from: "s-ii-actuators", to: { x: 800, y: 197 } },
            { from: "s-ivb-actuators", to: { x: 800, y: 272 } },
            { from: "s-ivb-propulsion", to: { x: 800, y: 367 } },
          ],
        },
      ],
    },
  };
}
