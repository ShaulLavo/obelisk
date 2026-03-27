// @repo/utils: Pure, framework-agnostic utility functions only.
// DOM helpers belong in @repo/ui. SolidJS-specific hooks belong in
// their consuming packages.
//
// NOTE: solid-js is currently listed as a dependency because some
// submodules (e.g., hooks/) expose SolidJS-specific helpers.
// Plan: migrate SolidJS-coupled exports out of @repo/utils into
// their consuming packages so this package can drop the solid-js dep.

export * from './bytes'
export * from './dom'
export * from './parse'
export * from './pieceTable'
export * from './textHeuristics'
export * from './viewTransition'
