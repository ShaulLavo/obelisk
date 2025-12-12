/**
 * Entry file solely for the `unimported` CLI so it can trace our build/runtime
 * scripts and validate dependencies. This file should not be imported at
 * runtime.
 */
import './scripts/build'
import './scripts/fetch-packs'
import './scripts/runtime/index'

export {}
