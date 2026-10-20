import { ToolDefinition } from '@/types/api';

export const ALL_TOOLS: ToolDefinition[] = [
  // ==========================================
  // PHASE 1: Essential PDF Tools
  // ==========================================
  {
    id: 'merge-pdf',
    slug: 'merge',
    title: 'Merge PDF',
    shortDesc: 'Combine multiple PDFs into one unified document',
    description: 'Combine two or more PDF files in any order you choose into a single, cohesive document. Fast, clean, and lossless.',
    category: 'Organize & Manage',
    iconName: 'Layers',
    badge: 'Popular',
    isPopular: true,
    endpoint: '/tools/pdf/merge',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 2,
    maxFiles: 20,
    features: [
      'Preserves original vector resolution and metadata',
      'Drag-and-drop page reordering',
      'Batch processing up to 20 documents simultaneously'
    ]
  },
  {
    id: 'split-pdf',
    slug: 'split',
    title: 'Split PDF',
    shortDesc: 'Extract pages or split into individual documents',
    description: 'Separate one page or a whole set for easy conversion into independent PDF files.',
    category: 'Organize & Manage',
    iconName: 'Scissors',
    isPopular: true,
    endpoint: '/tools/pdf/split',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 1,
    maxFiles: 1,
    params: [
      {
        name: 'ranges',
        label: 'Page Ranges',
        type: 'text',
        placeholder: 'e.g. 1-3, 5, 8-10 (leave empty to split all individual pages)',
        description: 'Specify ranges like 1-3,5 or leave empty to burst into individual single-page files packed in a ZIP.'
      }
    ]
  },
  {
    id: 'compress-pdf',
    slug: 'compress',
    title: 'Compress PDF',
    shortDesc: 'Reduce file size while preserving high visual quality',
    description: 'Optimize internal streams and eliminate redundant font descriptors to shrink document size for easy emailing.',
    category: 'Optimize & Edit',
    iconName: 'Minimize2',
    badge: 'Popular',
    isPopular: true,
    endpoint: '/tools/pdf/compress',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 1,
    maxFiles: 1,
    features: [
      'Removes unreferenced object streams and duplicate fonts',
      'Maintains vector clarity and readable text typography',
      'Optimized for email attachments and web upload limits'
    ]
  },
  {
    id: 'rotate-pdf',
    slug: 'rotate',
    title: 'Rotate PDF',
    shortDesc: 'Rotate specific pages or entire documents',
    description: 'Orient your documents correctly. Rotate individual pages or all pages clockwise or counterclockwise.',
    category: 'Organize & Manage',
    iconName: 'RotateCw',
    endpoint: '/tools/pdf/rotate',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 1,
    maxFiles: 1,
    params: [
      {
        name: 'rotation',
        label: 'Rotation Angle',
        type: 'rotation',
        defaultValue: 90,
        options: [
          { label: '90° Clockwise', value: 90 },
          { label: '180° Half Turn', value: 180 },
          { label: '270° Counter-Clockwise', value: 270 }
        ],
        required: true
      },
      {
        name: 'pages',
        label: 'Target Pages (Optional)',
        type: 'text',
        placeholder: 'e.g. 1, 3, 5 (or leave empty for all pages)',
        description: 'Comma-separated 1-based page numbers to rotate, or leave blank to rotate every page.'
      }
    ]
  },
  {
    id: 'to-images',
    slug: 'to-images',
    title: 'PDF to JPG / PNG',
    shortDesc: 'Convert PDF pages into high-resolution images',
    description: 'Render each page of your PDF into crisp JPG or PNG images. Multi-page documents are packaged in a convenient ZIP archive.',
    category: 'Convert',
    iconName: 'Image',
    isPopular: true,
    endpoint: '/tools/pdf/to-images',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 1,
    maxFiles: 1,
    params: [
      {
        name: 'format',
        label: 'Output Image Format',
        type: 'select',
        defaultValue: 'png',
        options: [
          { label: 'PNG (Lossless & Crisp Text)', value: 'png' },
          { label: 'JPG (Compact File Size)', value: 'jpg' }
        ],
        required: true
      }
    ]
  },
  {
    id: 'images-to-pdf',
    slug: 'images-to-pdf',
    title: 'JPG / PNG to PDF',
    shortDesc: 'Convert and combine image files into a PDF',
    description: 'Transform photos, scans, and graphic files (JPG, PNG) into a neat, standardized multi-page PDF document.',
    category: 'Convert',
    iconName: 'FileImage',
    badge: 'Popular',
    isPopular: true,
    endpoint: '/tools/images/to-pdf',
    accept: ['.jpg', '.jpeg', '.png'],
    acceptMimeTypes: ['image/jpeg', 'image/png'],
    minFiles: 1,
    maxFiles: 20
  },
  {
    id: 'reorder-pdf',
    slug: 'reorder',
    title: 'Reorder Pages',
    shortDesc: 'Rearrange the sequence of PDF pages',
    description: 'Change the order of pages inside your PDF document to match your presentation or archive sequence.',
    category: 'Organize & Manage',
    iconName: 'ArrowUpDown',
    endpoint: '/tools/pdf/reorder',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 1,
    maxFiles: 1,
    params: [
      {
        name: 'pageOrder',
        label: 'New Page Order',
        type: 'text',
        placeholder: 'e.g. 3, 1, 2, 4',
        description: 'Enter the desired 1-based page sequence separated by commas.',
        required: true
      }
    ]
  },
  {
    id: 'extract-pdf',
    slug: 'extract',
    title: 'Extract Pages',
    shortDesc: 'Pick specific pages and build a new document',
    description: 'Select exactly the pages you need from a large document and export them into a fresh PDF file.',
    category: 'Organize & Manage',
    iconName: 'ExternalLink',
    endpoint: '/tools/pdf/extract',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 1,
    maxFiles: 1,
    params: [
      {
        name: 'pages',
        label: 'Pages to Extract',
        type: 'text',
        placeholder: 'e.g. 1, 4, 7-10',
        description: 'Specify 1-based page numbers or ranges to extract into the new document.',
        required: true
      }
    ]
  },
  {
    id: 'delete-pdf',
    slug: 'delete-pages',
    title: 'Delete Pages',
    shortDesc: 'Remove unnecessary pages from your PDF',
    description: 'Prune unwanted cover sheets, blank pages, or outdated sections from your document cleanly.',
    category: 'Organize & Manage',
    iconName: 'Trash2',
    endpoint: '/tools/pdf/delete',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 1,
    maxFiles: 1,
    params: [
      {
        name: 'pages',
        label: 'Pages to Delete',
        type: 'text',
        placeholder: 'e.g. 2, 5, 8',
        description: 'Comma-separated 1-based page numbers to permanently remove from the document.',
        required: true
      }
    ]
  },
  {
    id: 'organize-pdf',
    slug: 'organize',
    title: 'Organize PDF',
    shortDesc: 'Reorder, rotate, and delete pages atomically',
    description: 'All-in-one visual page manager to reorganize your document in a single batch pass.',
    category: 'Organize & Manage',
    iconName: 'Grid',
    endpoint: '/tools/pdf/organize',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 1,
    maxFiles: 1,
    params: [
      {
        name: 'operations',
        label: 'Page Operations JSON',
        type: 'text',
        placeholder: '[{"pageNumber": 1, "rotation": 90}, {"pageNumber": 2, "deleted": true}]',
        description: 'JSON array of transformations to apply per page.',
        required: true
      }
    ]
  },
  {
    id: 'crop-pdf',
    slug: 'crop',
    title: 'Crop PDF',
    shortDesc: 'Trim margins or resize page boundaries',
    description: 'Trim excess white borders or adjust print boundaries on all pages of your PDF document.',
    category: 'Optimize & Edit',
    iconName: 'Crop',
    endpoint: '/tools/pdf/crop',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 1,
    maxFiles: 1,
    params: [
      { name: 'top', label: 'Top Margin (pt)', type: 'number', defaultValue: 20, min: 0, max: 200 },
      { name: 'bottom', label: 'Bottom Margin (pt)', type: 'number', defaultValue: 20, min: 0, max: 200 },
      { name: 'left', label: 'Left Margin (pt)', type: 'number', defaultValue: 20, min: 0, max: 200 },
      { name: 'right', label: 'Right Margin (pt)', type: 'number', defaultValue: 20, min: 0, max: 200 }
    ]
  },
  {
    id: 'add-page-numbers',
    slug: 'add-page-numbers',
    title: 'Add Page Numbers',
    shortDesc: 'Insert numbered pagination into headers or footers',
    description: 'Stamp professional page numbers with configurable placement, font styling, and total count formatting.',
    category: 'Optimize & Edit',
    iconName: 'Hash',
    endpoint: '/tools/pdf/add-page-numbers',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 1,
    maxFiles: 1,
    params: [
      {
        name: 'position',
        label: 'Position',
        type: 'select',
        defaultValue: 'bottom-center',
        options: [
          { label: 'Bottom Center', value: 'bottom-center' },
          { label: 'Bottom Right', value: 'bottom-right' },
          { label: 'Bottom Left', value: 'bottom-left' },
          { label: 'Top Center', value: 'top-center' },
          { label: 'Top Right', value: 'top-right' },
          { label: 'Top Left', value: 'top-left' }
        ],
        required: true
      },
      {
        name: 'format',
        label: 'Format Template',
        type: 'select',
        defaultValue: 'page_of_total',
        options: [
          { label: 'Page X of Y (e.g. Page 1 of 12)', value: 'page_of_total' },
          { label: 'Page X (e.g. Page 1)', value: 'page_number' },
          { label: 'Number Only (e.g. 1)', value: 'number_only' }
        ],
        required: true
      },
      {
        name: 'fontSize',
        label: 'Font Size (pt)',
        type: 'number',
        defaultValue: 10,
        min: 8,
        max: 24
      }
    ]
  },
  {
    id: 'add-watermark',
    slug: 'add-watermark',
    title: 'Add Watermark',
    shortDesc: 'Stamp custom confidential or draft watermarks',
    description: 'Overlay custom text across every page with adjustable transparency and angle.',
    category: 'Security & Protection',
    iconName: 'Stamp',
    endpoint: '/tools/pdf/add-watermark',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 1,
    maxFiles: 1,
    params: [
      {
        name: 'text',
        label: 'Watermark Text',
        type: 'text',
        defaultValue: 'CONFIDENTIAL',
        placeholder: 'e.g. CONFIDENTIAL, DRAFT, INTERNAL ONLY',
        required: true
      },
      {
        name: 'opacity',
        label: 'Opacity (0.1 - 1.0)',
        type: 'number',
        defaultValue: 0.3,
        min: 0.1,
        max: 1.0,
        step: 0.05
      },
      {
        name: 'rotationDegrees',
        label: 'Rotation Degrees',
        type: 'number',
        defaultValue: 45,
        min: -90,
        max: 90,
        step: 15
      }
    ]
  },
  {
    id: 'protect-pdf',
    slug: 'protect',
    title: 'Protect PDF',
    shortDesc: 'Encrypt your document with password security',
    description: 'Apply industry-standard AES encryption to prevent unauthorized opening or editing of your files.',
    category: 'Security & Protection',
    iconName: 'Lock',
    badge: 'Popular',
    isPopular: true,
    endpoint: '/tools/pdf/protect',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 1,
    maxFiles: 1,
    params: [
      {
        name: 'password',
        label: 'Document Open Password',
        type: 'password',
        placeholder: 'Enter a strong password',
        description: 'Required to open and view the encrypted document.',
        required: true
      },
      {
        name: 'ownerPassword',
        label: 'Owner / Permission Password (Optional)',
        type: 'password',
        placeholder: 'Optional owner password for permission overrides'
      }
    ]
  },
  {
    id: 'unlock-pdf',
    slug: 'unlock',
    title: 'Unlock PDF',
    shortDesc: 'Remove password restrictions from protected files',
    description: 'Provide the authorized password to decrypt the PDF and remove future prompt requirements permanently.',
    category: 'Security & Protection',
    iconName: 'Unlock',
    endpoint: '/tools/pdf/unlock',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 1,
    maxFiles: 1,
    params: [
      {
        name: 'password',
        label: 'Current Password',
        type: 'password',
        placeholder: 'Enter the password to unlock this file',
        required: true
      }
    ]
  },

  // ==========================================
  // PHASE 2: Office & File Conversion
  // ==========================================
  {
    id: 'pdf-to-word',
    slug: 'pdf-to-word',
    title: 'PDF to Word',
    shortDesc: 'Convert PDF files to editable DOCX documents',
    description: 'Extract layout, paragraphs, and tables into an editable Microsoft Word document with high structural fidelity.',
    category: 'Convert',
    iconName: 'FileText',
    badge: 'Popular',
    isPopular: true,
    isConversion: true,
    fromFormat: 'PDF',
    toFormat: 'DOCX',
    endpoint: '/tools/convert/pdf-to-word',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 1,
    maxFiles: 1,
    requiresLibreOffice: true,
    limitations: 'Requires LibreOffice engine on backend. Layout fidelity is maximized for text and tabular documents.'
  },
  {
    id: 'word-to-pdf',
    slug: 'word-to-pdf',
    title: 'Word to PDF',
    shortDesc: 'Convert DOCX / DOC files into standardized PDF',
    description: 'Transform Microsoft Word documents into presentation-ready PDFs with 100% font and pagination fidelity.',
    category: 'Convert',
    iconName: 'FileType',
    isPopular: true,
    isConversion: true,
    fromFormat: 'DOCX',
    toFormat: 'PDF',
    endpoint: '/tools/convert/word-to-pdf',
    accept: ['.docx', '.doc'],
    acceptMimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ],
    minFiles: 1,
    maxFiles: 1,
    requiresLibreOffice: true
  },
  {
    id: 'pdf-to-excel',
    slug: 'pdf-to-excel',
    title: 'PDF to Excel',
    shortDesc: 'Extract tables from PDF into XLSX spreadsheets',
    description: 'Pull structured data and financial statements from PDF files directly into editable Excel workbooks.',
    category: 'Convert',
    iconName: 'Table',
    isConversion: true,
    fromFormat: 'PDF',
    toFormat: 'XLSX',
    endpoint: '/tools/convert/pdf-to-excel',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 1,
    maxFiles: 1,
    requiresLibreOffice: true
  },
  {
    id: 'excel-to-pdf',
    slug: 'excel-to-pdf',
    title: 'Excel to PDF',
    shortDesc: 'Convert spreadsheets to printable PDF sheets',
    description: 'Turn your XLSX and XLS sheets into clean, professional PDF reports with formatted column widths.',
    category: 'Convert',
    iconName: 'Sheet',
    isConversion: true,
    fromFormat: 'XLSX',
    toFormat: 'PDF',
    endpoint: '/tools/convert/excel-to-pdf',
    accept: ['.xlsx', '.xls'],
    acceptMimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ],
    minFiles: 1,
    maxFiles: 1,
    requiresLibreOffice: true
  },
  {
    id: 'pdf-to-powerpoint',
    slug: 'pdf-to-powerpoint',
    title: 'PDF to PowerPoint',
    shortDesc: 'Convert PDF slides into PPTX presentation decks',
    description: 'Convert presentation PDFs into editable PowerPoint decks for future editing and presentation.',
    category: 'Convert',
    iconName: 'Presentation',
    isConversion: true,
    fromFormat: 'PDF',
    toFormat: 'PPTX',
    endpoint: '/tools/convert/pdf-to-powerpoint',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 1,
    maxFiles: 1,
    requiresLibreOffice: true
  },
  {
    id: 'powerpoint-to-pdf',
    slug: 'powerpoint-to-pdf',
    title: 'PowerPoint to PDF',
    shortDesc: 'Convert PPTX decks into universally viewable PDF',
    description: 'Lock in presentation layouts and slide transitions for hassle-free distribution across any device.',
    category: 'Convert',
    iconName: 'Airplay',
    isConversion: true,
    fromFormat: 'PPTX',
    toFormat: 'PDF',
    endpoint: '/tools/convert/powerpoint-to-pdf',
    accept: ['.pptx', '.ppt'],
    acceptMimeTypes: [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint'
    ],
    minFiles: 1,
    maxFiles: 1,
    requiresLibreOffice: true
  },
  {
    id: 'html-to-pdf',
    slug: 'html-to-pdf',
    title: 'HTML to PDF',
    shortDesc: 'Convert web pages or HTML files to PDF',
    description: 'Transform HTML files and styled markup into paginated, high-fidelity PDF documents.',
    category: 'Convert',
    iconName: 'Code',
    isConversion: true,
    fromFormat: 'HTML',
    toFormat: 'PDF',
    endpoint: '/tools/convert/html-to-pdf',
    accept: ['.html', '.htm'],
    acceptMimeTypes: ['text/html'],
    minFiles: 1,
    maxFiles: 1
  },
  {
    id: 'word-to-html',
    slug: 'word-to-html',
    title: 'Word to HTML',
    shortDesc: 'Extract clean semantic HTML from DOCX files',
    description: 'Convert Word documents to clean HTML markup using Mammoth engine, preserving headings, tables, and images.',
    category: 'Convert',
    iconName: 'FileCode',
    isConversion: true,
    fromFormat: 'DOCX',
    toFormat: 'HTML',
    endpoint: '/tools/convert/word-to-html',
    accept: ['.docx'],
    acceptMimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    minFiles: 1,
    maxFiles: 1
  },
  {
    id: 'csv-to-excel',
    slug: 'csv-to-excel',
    title: 'CSV to Excel',
    shortDesc: 'Convert CSV data files into styled XLSX workbooks',
    description: 'Format raw comma-separated values into a styled Excel workbook with auto-fitted columns and headers.',
    category: 'Convert',
    iconName: 'FileSpreadsheet',
    isConversion: true,
    fromFormat: 'CSV',
    toFormat: 'XLSX',
    endpoint: '/tools/convert/csv-to-excel',
    accept: ['.csv'],
    acceptMimeTypes: ['text/csv'],
    minFiles: 1,
    maxFiles: 1
  },
  {
    id: 'excel-to-csv',
    slug: 'excel-to-csv',
    title: 'Excel to CSV',
    shortDesc: 'Export Excel worksheets as clean CSV text',
    description: 'Extract data worksheets into universal UTF-8 comma-separated text files for database ingestion.',
    category: 'Convert',
    iconName: 'FileBarChart2',
    isConversion: true,
    fromFormat: 'XLSX',
    toFormat: 'CSV',
    endpoint: '/tools/convert/excel-to-csv',
    accept: ['.xlsx', '.xls'],
    acceptMimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ],
    minFiles: 1,
    maxFiles: 1
  },
  {
    id: 'txt-to-pdf',
    slug: 'txt-to-pdf',
    title: 'TXT to PDF',
    shortDesc: 'Convert plain text into formatted, paginated PDF',
    description: 'Create neatly formatted PDF files from plain text documents with standard margins and monospaced or sans-serif styling.',
    category: 'Convert',
    iconName: 'AlignLeft',
    isConversion: true,
    fromFormat: 'TXT',
    toFormat: 'PDF',
    endpoint: '/tools/convert/txt-to-pdf',
    accept: ['.txt'],
    acceptMimeTypes: ['text/plain'],
    minFiles: 1,
    maxFiles: 1
  },
  {
    id: 'rtf-to-pdf',
    slug: 'rtf-to-pdf',
    title: 'RTF to PDF',
    shortDesc: 'Convert Rich Text Format files to PDF',
    description: 'Transform legacy RTF documents into accessible, modern PDF files with preserved formatting.',
    category: 'Convert',
    iconName: 'FileCheck',
    isConversion: true,
    fromFormat: 'RTF',
    toFormat: 'PDF',
    endpoint: '/tools/convert/rtf-to-pdf',
    accept: ['.rtf'],
    acceptMimeTypes: ['application/rtf'],
    minFiles: 1,
    maxFiles: 1,
    requiresLibreOffice: true
  },
  {
    id: 'pdf-to-html',
    slug: 'pdf-to-html',
    title: 'PDF to HTML',
    shortDesc: 'Convert PDF pages to standalone styled HTML markup',
    description: 'Transform PDF documents into responsive HTML web pages preserving layout, text, and embedded graphics.',
    category: 'Convert',
    iconName: 'FileCode',
    isConversion: true,
    fromFormat: 'PDF',
    toFormat: 'HTML',
    endpoint: '/tools/convert/pdf-to-html',
    accept: ['.pdf'],
    acceptMimeTypes: ['application/pdf'],
    minFiles: 1,
    maxFiles: 1,
    requiresLibreOffice: true,
    limitations: 'Requires LibreOffice document engine. Output is packaged as a styled HTML page.'
  },
  {
    id: 'odt-to-pdf',
    slug: 'odt-to-pdf',
    title: 'ODT to PDF',
    shortDesc: 'Convert OpenDocument text files to standardized PDF',
    description: 'Transform LibreOffice / OpenOffice Writer documents (.odt) into clean, universal PDF documents.',
    category: 'Convert',
    iconName: 'FileType',
    isConversion: true,
    fromFormat: 'ODT',
    toFormat: 'PDF',
    endpoint: '/tools/convert/odt-to-pdf',
    accept: ['.odt'],
    acceptMimeTypes: ['application/vnd.oasis.opendocument.text'],
    minFiles: 1,
    maxFiles: 1,
    requiresLibreOffice: true,
    limitations: 'Requires LibreOffice engine on backend.'
  },
  {
    id: 'ods-to-pdf',
    slug: 'ods-to-pdf',
    title: 'ODS to PDF',
    shortDesc: 'Convert OpenDocument spreadsheets to printable PDF',
    description: 'Convert LibreOffice / OpenOffice Calc sheets (.ods) into clean, formatted PDF reports.',
    category: 'Convert',
    iconName: 'Sheet',
    isConversion: true,
    fromFormat: 'ODS',
    toFormat: 'PDF',
    endpoint: '/tools/convert/ods-to-pdf',
    accept: ['.ods'],
    acceptMimeTypes: ['application/vnd.oasis.opendocument.spreadsheet'],
    minFiles: 1,
    maxFiles: 1,
    requiresLibreOffice: true,
    limitations: 'Requires LibreOffice engine on backend.'
  },
  {
    id: 'odp-to-pdf',
    slug: 'odp-to-pdf',
    title: 'ODP to PDF',
    shortDesc: 'Convert OpenDocument presentations to PDF slides',
    description: 'Transform LibreOffice / OpenOffice Impress decks (.odp) into presentation-ready PDF documents.',
    category: 'Convert',
    iconName: 'Presentation',
    isConversion: true,
    fromFormat: 'ODP',
    toFormat: 'PDF',
    endpoint: '/tools/convert/odp-to-pdf',
    accept: ['.odp'],
    acceptMimeTypes: ['application/vnd.oasis.opendocument.presentation'],
    minFiles: 1,
    maxFiles: 1,
    requiresLibreOffice: true,
    limitations: 'Requires LibreOffice engine on backend.'
  },
  {
    id: 'batch-convert',
    slug: 'batch',
    title: 'Batch File Conversion',
    shortDesc: 'Convert collections of mixed documents simultaneously',
    description: 'Process multiple documents across Word, Excel, PowerPoint, CSV, HTML, RTF, and plain text into your desired format in one single operation.',
    category: 'Convert',
    iconName: 'Layers',
    badge: 'Multi-File',
    isPopular: true,
    isConversion: true,
    fromFormat: 'ANY',
    toFormat: 'PDF',
    endpoint: '/tools/convert/batch',
    accept: [
      '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt',
      '.csv', '.txt', '.html', '.htm', '.rtf', '.odt', '.ods', '.odp'
    ],
    minFiles: 1,
    maxFiles: 20
  }
];

export function getToolBySlug(slug: string): ToolDefinition | undefined {
  return ALL_TOOLS.find((t) => t.slug === slug || t.id === slug);
}

export function getToolsByCategory(category: string): ToolDefinition[] {
  if (category === 'All') return ALL_TOOLS;
  return ALL_TOOLS.filter((t) => t.category === category);
}

export const CATEGORIES = [
  'All',
  'Organize & Manage',
  'Optimize & Edit',
  'Security & Protection',
  'Convert'
] as const;
