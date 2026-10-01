import type { CreativePresetModule, SeasonRecapParameters } from "../contracts.ts"

/** A fixed-seed public-data composition; no clock, network, identity, or random global state. */
export const createSketch: CreativePresetModule<SeasonRecapParameters>["createSketch"] =
  (input) => (instance) => {
    let frame = 0
    const draw = () => {
      const width = Math.max(1, instance.width)
      const height = Math.max(1, instance.height)
      const gap = (width - 48) / input.parameters.values.length
      const seedOffset = ((input.seed >>> 0) % 97) / 97
      instance.background(247, 244, 236)
      instance.push()
      instance.stroke(27, 44, 46)
      instance.strokeWeight(input.parameters.lineWeight)
      instance.line(24, height - 24, width - 24, height - 24)
      for (const [index, value] of input.parameters.values.entries()) {
        const x = 24 + gap * (index + 0.5)
        const y = height - 28 - value * (height - 56)
        instance.stroke(27, 44, 46)
        instance.line(x, height - 28, x, y)
        instance.noStroke()
        instance.fill(190, 70, 49)
        instance.drawingContext.beginPath()
        instance.drawingContext.arc(x, y, 3 + seedOffset * 2, 0, Math.PI * 2)
        instance.drawingContext.fill()
      }
      instance.pop()
      input.onFrame(frame++)
    }
    instance.setup = () => {
      const canvas = instance.createCanvas(input.width(), 180) as {
        pixelDensity: (density: number) => unknown
        resize: (width: number, height: number) => unknown
      }
      canvas.pixelDensity(1)
      instance.noLoop()
      draw()
      input.onRenderReady({ render: draw, resize: (width, height) => canvas.resize(width, height) })
    }
    instance.draw = () => undefined
  }
