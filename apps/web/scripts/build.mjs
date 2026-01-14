#!/usr/bin/env node
import { build } from 'vite'

// Intercept process.exit to see what's happening
const originalExit = process.exit
process.exit = (code) => {
  console.error(`\n========== PROCESS EXIT INTERCEPTED ==========`)
  console.error(`Exit code: ${code}`)
  console.error(`Stack trace:`, new Error().stack)
  console.error(`==============================================\n`)
  originalExit(code)
}

// Catch unhandled errors
process.on('uncaughtException', (error) => {
  console.error('\n========== UNCAUGHT EXCEPTION ==========')
  console.error('Error:', error)
  console.error('Stack:', error?.stack)
  console.error('=========================================\n')
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n========== UNHANDLED REJECTION ==========')
  console.error('Reason:', reason)
  console.error('Promise:', promise)
  console.error('=========================================\n')
  process.exit(1)
})

async function runBuild() {
  try {
    console.log('Starting Vite build...')
    await build({
      logLevel: 'info',
    })
    console.log('Build completed successfully!')
  } catch (error) {
    console.error('\n========== BUILD ERROR DETAILS ==========')
    console.error('Error name:', error?.name)
    console.error('Error message:', error?.message)
    console.error('Error code:', error?.code)
    console.error('Error cause:', error?.cause)
    if (error?.plugin) {
      console.error('Plugin:', error.plugin)
    }
    if (error?.frame) {
      console.error('Frame:', error.frame)
    }
    if (error?.id) {
      console.error('File ID:', error.id)
    }
    if (error?.loc) {
      console.error('Location:', JSON.stringify(error.loc))
    }
    // Only print stack, skip full error object to avoid log overflow
    console.error('\nStack trace:', error?.stack)
    console.error('==========================================\n')
    originalExit(1)
  }
}

runBuild()
