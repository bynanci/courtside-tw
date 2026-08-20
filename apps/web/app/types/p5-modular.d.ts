declare module "p5/core" {
  import P5 from "p5"

  const P5Core: typeof P5 & {
    registerAddon: (addon: (constructor: typeof P5) => void) => void
  }

  export default P5Core
}

declare module "p5/color" {
  import P5 from "p5"

  const colorAddon: (constructor: typeof P5) => void
  export default colorAddon
}

declare module "p5/shape" {
  import P5 from "p5"

  const shapeAddon: (constructor: typeof P5) => void
  export default shapeAddon
}
