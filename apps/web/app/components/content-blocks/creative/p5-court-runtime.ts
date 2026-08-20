import P5 from "p5/core"
import color from "p5/color"
import shape from "p5/shape"

P5.registerAddon(color)
P5.registerAddon(shape)

Object.defineProperty(P5, "__courtsideRuntimeSignature", {
  value: "courtside-p5-core-color-shape",
  configurable: false,
  enumerable: false,
  writable: false
})

export default P5
