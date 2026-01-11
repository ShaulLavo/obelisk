# Implementation Plan: Split Editor

## Overview

Implementation of a recursive split editor system with VS Code-style tab management. Each pane (editor group) can hold multiple tabs. The system consists of a Layout Manager (SolidJS store), Resource Manager (shared workers/buffers by tab), and Split Editor Component (UI with TabBar). Builds on the existing `@repo/ui` Resizable component.

## Tasks

- [x] 1. Create Layout Tree Types and Core Store
  - [x] 1.1 Create layout types file with NodeId, TabId, SplitDirection, SplitNode, SplitContainer, EditorPane, Tab, TabContent, TabState interfaces
    - Define all TypeScript types for the layout tree structure
    - Include Tab interface with content, state, isDirty
    - Include serialization types for persistence
    - _Requirements: 1.3, 3.1, 7.1, 7.2_

  - [x] 1.2 Implement createLayoutManager store with createStore, produce, and reconcile
    - Initialize empty layout state
    - Add derived signals for paneIds, getAllTabs, findTabByFilePath
    - Use batch() for coordinated updates
    - _Requirements: 1.1, 1.2, 1.6, 1.7_

  - [x] 1.3 Write property test for layout tree integrity
    - **Property 1: Layout Tree Integrity**
    - Generate random split/close sequences, verify tree is valid binary tree
    - **Validates: Requirements 1.3, 3.1, 3.2**
    - **Note: Standard unit test - no browser mode needed**

- [x] 2. Implement Split and Close Operations
  - [x] 2.1 Implement splitPane(paneId, direction) action
    - Create new container and pane
    - New pane starts with empty tabs array
    - Copy viewSettings from original pane
    - Use produce for immutable updates
    - _Requirements: 3.2, 4.1, 4.2, 4.3, 16.1_

  - [x] 2.2 Implement closePane(paneId) action
    - Promote sibling to parent position
    - Handle root case (prevent closing last pane)
    - Update focus if closed pane was focused
    - _Requirements: 6.2, 6.3, 6.4, 16.2_

  - [x] 2.3 Write property test for split operation correctness
    - **Property 2: Split Operation Correctness**
    - Split any pane, verify container structure with two children
    - **Validates: Requirements 3.2, 4.1, 4.2**
    - **Note: Standard unit test - no browser mode needed**

  - [x] 2.4 Write property test for close operation correctness
    - **Property 3: Close Operation Correctness**
    - Close any pane (except last), verify sibling promotion
    - **Validates: Requirements 6.2, 6.3, 6.4**
    - **Note: Standard unit test - no browser mode needed**

- [x] 3. Implement Resource Manager
  - [x] 3.1 Create Resource Manager with worker pool, highlight cache, and buffer manager
    - Track file usage with Map<filePath, Set<tabId>>
    - Implement reference counting for cleanup by tabId
    - Use createMemo for derived state
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

  - [x] 3.2 Implement SharedBuffer for multi-tab editing
    - Create signal-based content storage
    - Implement applyEdit with listener notification
    - Coordinate edits across tabs showing same file
    - _Requirements: 2.5_

  - [x] 3.3 Write property test for resource sharing
    - **Property 4: Resource Sharing Consistency**
    - Open same file in multiple tabs, verify shared worker/highlighting
    - **Validates: Requirements 2.1, 2.2, 2.5**
    - **Note: Standard unit test - no browser mode needed**

  - [x] 3.4 Write property test for resource cleanup
    - **Property 5: Resource Cleanup**
    - Close all tabs for a file, verify resources cleaned up
    - **Validates: Requirements 2.4**
    - **Note: Standard unit test - no browser mode needed**

- [x] 4. Checkpoint - Core Logic Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4.5 Integrate Split Editor with Main App (Early Integration)
  - [x] 4.5.1 Replace single editor with SplitEditor in main app
    - Wire up SplitEditor component in place of current editor
    - Initialize layout manager with single pane
    - Open current file as first tab
    - Verify basic rendering works
    - _Requirements: 3.3, 3.4, 7.1, 7.2_
    - **Note: Integration test - USE BROWSER MODE for component rendering verification**

  - [x] 4.5.2 Wire up file opening to use tabs
    - When file is opened from tree, open as tab in focused pane
    - Test opening multiple files creates multiple tabs
    - Test switching between tabs works
    - _Requirements: 7.3, 7.5, 9.1_
    - **Note: Integration test - USE BROWSER MODE for DOM interaction testing**

- [x] 5. Implement Tab Operations
  - [x] 5.1 Implement openTab(paneId, content) action
    - Create new Tab with content and default state
    - Add to pane's tabs array
    - Set as activeTabId
    - _Requirements: 7.3, 16.4_

  - [x] 5.2 Implement closeTab(paneId, tabId) action
    - Remove tab from pane's tabs array
    - If active tab closed, activate next/prev tab
    - If last tab closed, close the pane
    - _Requirements: 7.4, 7.6, 7.7, 16.5_

  - [x] 5.3 Implement setActiveTab(paneId, tabId) action
    - Update pane's activeTabId
    - _Requirements: 7.5, 16.6_

  - [x] 5.4 Implement moveTab(fromPaneId, tabId, toPaneId) action
    - Remove tab from source pane
    - Add to target pane
    - Close source pane if empty
    - _Requirements: 17.2_

  - [x] 5.5 Write property test for tab close cascading
    - **Property 11: Tab Close Cascading**
    - Close last tab in pane, verify pane closes
    - **Validates: Requirements 7.7**
    - **Note: Standard unit test - no browser mode needed**

  - [x] 5.6 Write property test for active tab consistency
    - **Property 12: Active Tab Consistency**
    - Close active tab, verify next tab becomes active
    - **Validates: Requirements 7.6**
    - **Note: Standard unit test - no browser mode needed**

- [x] 6. Implement Split Editor Component
  - [x] 6.1 Create SplitEditor root component
    - Render recursive SplitNode tree
    - Provide layout context to children
    - _Requirements: 3.3, 3.4_

  - [x] 6.2 Create SplitNode recursive renderer
    - Switch between SplitContainer and EditorPaneSlot based on node type
    - Handle unlimited nesting depth
    - _Requirements: 3.3_

  - [x] 6.3 Create SplitContainer component using existing Resizable
    - Wrap @repo/ui Resizable component
    - Pass direction and sizes from layout state
    - Handle onSizesChange to update layout store
    - _Requirements: 3.4, 4.1, 4.2, 5.1, 5.4_

  - [x] 6.4 Create EditorPaneSlot component
    - Render TabBar at top
    - Render portal target div for active tab content
    - Handle focus on click
    - Show focus indicator ring
    - _Requirements: 7.8, 14.1, 12.5_

- [x] 7. Implement Tab Bar Component
  - [x] 7.1 Create TabBar component
    - Render horizontal list of tabs
    - Support horizontal scroll for overflow
    - _Requirements: 7.8, 15.6_
    - **Note: Component test - USE BROWSER MODE for scroll behavior and DOM rendering**

  - [x] 7.2 Create TabItem component
    - Show file name from content
    - Show dirty indicator (dot) when isDirty
    - Show close button
    - Handle click to setActiveTab
    - Handle close button click to closeTab
    - _Requirements: 7.9, 7.10, 7.11, 14.4_
    - **Note: Component test - USE BROWSER MODE for click interactions and visual indicators**

- [x] 8. Implement Portal-Based Tab Rendering
  - [x] 8.1 Create PanePortals container component
    - Iterate over all paneIds
    - Render PanePortal for each
    - _Requirements: 13.1_
    - **Note: Component test - USE BROWSER MODE for portal rendering verification**

  - [x] 8.2 Create PanePortal component with SolidJS Portal
    - Find target element by pane ID
    - Render active tab's content inside Portal
    - _Requirements: 13.1, 13.2, 13.3_
    - **Note: Component test - USE BROWSER MODE for portal DOM manipulation**

  - [x] 8.3 Create TabContent switcher component
    - Switch on content type (file, diff, empty, custom)
    - Render appropriate content component
    - _Requirements: 7.2_
    - **Note: Component test - USE BROWSER MODE for content switching verification**

  - [x] 8.4 Write property test for portal state preservation
    - **Property 10: Portal State Preservation**
    - Change layout, verify tab state preserved
    - **Validates: Requirements 13.1, 13.4**
    - **Note: Integration test - USE BROWSER MODE for complex DOM state preservation**

- [-] 9. Implement Independent Tab State
  - [x] 9.1 Add tab state management to Layout Manager
    - Track scroll position, selections, cursor per tab
    - Implement updateTabState action
    - Keep tab state separate from shared file state
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 9.2 Add view settings management per pane
    - Implement updateViewSettings action
    - View settings shared across all tabs in pane
    - _Requirements: 8.4_

  - [-] 9.3 Create FileTab component with shared resources
    - Register/unregister with Resource Manager on mount/cleanup (by tabId)
    - Use shared buffer for content
    - Use independent state for scroll/selections
    - Use pane's viewSettings for display
    - _Requirements: 2.1, 2.5, 8.1, 8.2, 8.4_
    - **Note: Component test - USE BROWSER MODE for mount/cleanup lifecycle and editor integration**

  - [ ] 9.4 Write property test for independent tab state
    - **Property 6: Independent Tab State**
    - Open same file in multiple tabs, verify independent scroll/selections
    - **Validates: Requirements 8.1, 8.2, 8.3**
    - **Note: Integration test - USE BROWSER MODE for scroll/selection state verification**

- [ ] 9.5 Checkpoint - Editor Integration Complete
  - Ensure all tests pass and actual file editing works
  - Verify syntax highlighting, scrolling, and editing functionality
  - Ask the user if questions arise about editor behavior
  - **Note: Integration verification - USE BROWSER MODE for full editor functionality testing**

- [ ] 11. Checkpoint - UI and Tabs Complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Implement Layout Persistence
  - [ ] 12.1 Implement getLayoutTree() serialization
    - Convert layout state to SerializedLayout format
    - Include all tabs with their content and state
    - _Requirements: 11.1, 16.3_

  - [ ] 12.2 Implement restoreLayout() with reconcile
    - Use reconcile for efficient tree diffing
    - Handle missing files gracefully (show empty tab or remove)
    - _Requirements: 11.2, 11.3_

  - [ ] 12.3 Add auto-persistence with makePersisted and dualStorage
    - Debounce persistence writes
    - Restore on initialize()
    - _Requirements: 1.4, 1.5, 11.4, 11.5_

  - [ ] 12.4 Write property test for serialization round-trip
    - **Property 7: Layout Serialization Round-Trip**
    - Serialize then deserialize, verify equivalent layout with all tabs
    - **Validates: Requirements 11.1, 11.2**
    - **Note: Standard unit test - no browser mode needed**

- [ ] 13. Implement Focus and Keyboard Navigation
  - [ ] 13.1 Add focus tracking to Layout Manager
    - Track focusedPaneId in state
    - Implement setFocusedPane action
    - _Requirements: 12.6_

  - [ ] 13.2 Implement navigateFocus(direction) action
    - Calculate geometrically adjacent pane
    - Handle edge cases (no adjacent pane)
    - _Requirements: 12.1_

  - [ ] 13.3 Implement cycleTab(direction) action
    - Cycle through tabs in focused pane
    - _Requirements: 12.4_

  - [ ] 13.4 Add keyboard shortcuts for navigation, split, close, and tabs
    - Arrow keys with modifier for focus navigation
    - Shortcuts for split horizontal/vertical (Cmd+\, Cmd+Shift+\)
    - Shortcut for close current pane
    - Cmd+Tab/Cmd+Shift+Tab for tab cycling
    - Cmd+1/2/3 for pane switching
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ] 13.5 Write property test for focus navigation
    - **Property 8: Focus Navigation Consistency**
    - Navigate in direction, verify focus moves to adjacent pane
    - **Validates: Requirements 12.1, 12.5**

- [ ] 14. Implement Synchronized Scrolling
  - [ ] 14.1 Add scroll sync groups to Layout Manager
    - Track ScrollSyncGroup[] in state (links tabIds)
    - Implement linkScrollSync and unlinkScrollSync actions
    - _Requirements: 10.1, 10.3_

  - [ ] 14.2 Implement scroll sync coordination
    - Subscribe to scroll events in linked tabs
    - Calculate proportional scroll (line or percentage mode)
    - Apply scroll to other tabs in group
    - _Requirements: 10.2, 10.4_

  - [ ] 14.3 Write property test for scroll sync proportionality
    - **Property 9: Scroll Sync Proportionality**
    - Link tabs, scroll one, verify proportional scroll in others
    - **Validates: Requirements 10.1, 10.2, 10.4**

- [ ] 15. Add Visual Feedback and Polish
  - [ ] 15.1 Add focus indicator styling
    - Ring around focused pane
    - Theme-aware colors
    - _Requirements: 14.1, 14.3_

  - [ ] 15.2 Add minimum pane size enforcement
    - Configure minSize on Resizable
    - Prevent panes from becoming unusable
    - _Requirements: 5.3_

  - [ ] 15.3 Add CSS containment for performance
    - Apply contain: strict to pane containers
    - Optimize for deep nesting
    - _Requirements: 15.2, 15.3_

- [ ] 16. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - Verify performance with deep nesting (10+ levels)
  - Verify performance with many tabs (50+ tabs)
  - Test persistence across page reloads

## Notes

- All tasks are mandatory
- Uses `fast-check` for property-based testing with minimum 100 iterations
- Builds on existing `@repo/ui` Resizable component
- Uses SolidJS primitives: createStore, produce, reconcile, batch, untrack, createMemo
- Uses existing dualStorage utility for persistence
- Tab-based architecture follows VS Code editor group model
- View settings are per-pane (shared across tabs), tab state is per-tab
