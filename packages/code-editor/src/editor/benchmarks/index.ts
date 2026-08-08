export {
	generateContent,
	generatePresetContent,
	BENCHMARK_PRESETS,
} from './generateContent'
export type {
	ContentGeneratorOptions,
	BenchmarkPreset,
} from './generateContent'

export { getFixture, ALL_FIXTURE_CLASSES } from './fixtures'
export type { FixtureClass, BenchmarkFixture } from './fixtures'

export { CANARY_TRACE, CANARY_KEYSTROKE_COUNT } from './canaryTrace'
export type { CanaryStep } from './canaryTrace'

export {
	createTimingSession,
	MARK,
	summarizeTimings,
	formatTimingSummary,
} from './utils/timingMarks'
export type {
	TimingSession,
	PipelineTimingEntry,
	PipelineCounters,
	TimingSummary,
	MarkName,
} from './utils/timingMarks'
