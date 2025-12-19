; Markdown highlights for tree-sitter-markdown (Block Grammar)

; Headings
(atx_heading (atx_h1_marker) @keyword)
(atx_heading (atx_h2_marker) @keyword)
(atx_heading (atx_h3_marker) @keyword)
(atx_heading (atx_h4_marker) @keyword)
(atx_heading (atx_h5_marker) @keyword)
(atx_heading (atx_h6_marker) @keyword)
(atx_heading heading_content: (inline) @type)

(setext_heading heading_content: (paragraph) @type)
(setext_heading (setext_h1_underline) @keyword)
(setext_heading (setext_h2_underline) @keyword)

; Code Blocks (Fenced)
(fenced_code_block
  (fenced_code_block_delimiter) @comment
  (info_string) @type
  (code_fence_content) @comment
  (fenced_code_block_delimiter) @comment)

; Code Blocks (Indented)
(indented_code_block) @comment

; Lists
(list_marker_minus) @punctuation
(list_marker_plus) @punctuation
(list_marker_star) @punctuation
(list_marker_dot) @punctuation
(list_marker_parenthesis) @punctuation
(task_list_marker_checked) @keyword
(task_list_marker_unchecked) @comment

; Block Quotes
(block_quote_marker) @comment

; Thematic Break
(thematic_break) @punctuation

; HTML
(html_block) @comment

; Pipe Tables
(pipe_table_header) @type
(pipe_table_row) @string
(pipe_table_delimiter_row) @punctuation

; Links (Reference Definition)
(link_reference_definition
  (link_label) @function
  (link_destination) @string
  (link_title) @string)
