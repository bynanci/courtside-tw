import type { CourtPulseP5, CreativePresetModule } from "../contracts.ts"

const CANVAS_HEIGHT = 180

function seedPhase(seed: number): number {
  const boundedSeed = ((Math.trunc(seed) % 10_000) + 10_000) % 10_000
  return (boundedSeed / 10_000) * Math.PI * 2
}

export const createSketch: CreativePresetModule["createSketch"] = (input) => (instance) => {
  instance.setup = () => {
    const canvas = instance.createCanvas(input.width(), CANVAS_HEIGHT)
    canvas.parent(input.host)
    instance.pixelDensity(1)
    instance.frameRate(30)
    instance.randomSeed(input.seed)
    instance.noiseSeed(input.seed)
    instance.noLoop()
    input.onFrame(0)
    drawCourtPulse(instance, input.parameters, 0, seedPhase(input.seed))
  }
  instance.draw = () => {
    input.onFrame(instance.frameCount)
    drawCourtPulse(instance, input.parameters, instance.frameCount, seedPhase(input.seed))
  }
}

function drawCourtPulse(
  instance: CourtPulseP5,
  parameters: Parameters<typeof createSketch>[0]["parameters"],
  frame: number,
  fixedSeedPhase: number
): void {
  const { density, tempo, lineWeight, numericSequence } = parameters
  const width = Math.max(1, instance.width)
  const height = Math.max(1, instance.height)
  const phase = fixedSeedPhase + frame * tempo * 0.025
  const sequence = numericSequence.length > 0 ? numericSequence : [0.5]

  instance.background(11, 15, 23)
  instance.push()
  instance.stroke(238, 241, 235, 220)
  instance.strokeWeight(lineWeight)
  instance.noFill()
  instance.rect(12, 12, width - 24, height - 24, 6)
  instance.line(width / 2, 12, width / 2, height - 12)
  instance.arc(width / 2, height / 2, 64, 64, -instance.HALF_PI, instance.HALF_PI)
  instance.arc(width / 2, height / 2, 64, 64, instance.HALF_PI, instance.HALF_PI * 3)

  for (let index = 0; index < density; index += 1) {
    const ratio = sequence[index % sequence.length] ?? 0.5
    const x = 24 + ((index + 1) / (density + 1)) * (width - 48)
    const y = height / 2 + Math.sin(phase + index * 0.73) * (height * 0.28) * (0.4 + ratio * 0.6)
    instance.fill(232, 72, 49, 190)
    instance.noStroke()
    instance.circle(x, y, 2 + ratio * 8)
  }
  instance.pop()
}
