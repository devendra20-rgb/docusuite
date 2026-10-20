export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'DocuSuite Document Processing API',
    version: '1.0.0',
    description: 'Comprehensive, brand-neutral document processing backend for PDF tools and multi-format document conversions (Phase 1 & Phase 2). Designed for individual users, students, and professionals.'
  },
  servers: [
    {
      url: '/api',
      description: 'API base path'
    }
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Service liveness health probe',
        responses: {
          '200': {
            description: 'Service is healthy'
          }
        }
      }
    },
    '/ready': {
      get: {
        summary: 'Service readiness probe (DB, Redis, storage, LibreOffice)',
        responses: {
          '200': {
            description: 'Dependencies operational'
          },
          '503': {
            description: 'Dependencies unavailable'
          }
        }
      }
    },
    '/auth/register': {
      post: {
        summary: 'Register individual user account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  name: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          '201': { description: 'User created' },
          '400': { description: 'Validation error' }
        }
      }
    },
    '/auth/login': {
      post: {
        summary: 'Login and obtain access & refresh JWT tokens',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Login successful' },
          '401': { description: 'Invalid credentials' }
        }
      }
    },
    '/auth/me': {
      get: {
        summary: 'Get current user profile and quota usage',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'User profile returned' },
          '401': { description: 'Unauthorized' }
        }
      }
    },
    '/auth/history': {
      get: {
        summary: 'Get personal processing job history',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'User job history list' }
        }
      }
    },
    '/tools/pdf/merge': {
      post: {
        summary: 'Merge multiple PDF documents into a single PDF',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'PDFs merged successfully' }
        }
      }
    },
    '/tools/pdf/split': {
      post: {
        summary: 'Split PDF by page ranges or into individual pages',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' },
                  ranges: { type: 'string', description: 'e.g. 1-3,5,7-9 or leave empty for all individual pages' }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'PDF split successfully' }
        }
      }
    },
    '/tools/pdf/compress': {
      post: {
        summary: 'Compress and optimize PDF file structure',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'PDF compressed successfully' }
        }
      }
    },
    '/tools/pdf/rotate': {
      post: {
        summary: 'Rotate PDF pages (90, 180, or 270 degrees)',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' },
                  rotation: { type: 'integer', enum: [90, 180, 270] },
                  pages: { type: 'string', description: 'Comma-separated 1-based page numbers' }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'PDF pages rotated' }
        }
      }
    },
    '/tools/pdf/to-images': {
      post: {
        summary: 'Render PDF pages into JPG or PNG images (returns single image or ZIP)',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' },
                  format: { type: 'string', enum: ['png', 'jpg'] }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'PDF converted to images' }
        }
      }
    },
    '/tools/images/to-pdf': {
      post: {
        summary: 'Convert JPG/PNG images into a PDF document',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' }
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Images converted to PDF' }
        }
      }
    },
    '/tools/pdf/reorder': {
      post: {
        summary: 'Reorder PDF pages according to sequence array',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' },
                  pageOrder: { type: 'string', description: 'JSON array or comma-separated e.g. [3,1,2]' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'Pages reordered' } }
      }
    },
    '/tools/pdf/extract': {
      post: {
        summary: 'Extract specific pages into a new PDF',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' },
                  pages: { type: 'string', description: 'JSON array or comma-separated e.g. [1,3]' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'Pages extracted' } }
      }
    },
    '/tools/pdf/delete': {
      post: {
        summary: 'Delete specified pages from PDF',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' },
                  pages: { type: 'string', description: 'JSON array or comma-separated e.g. [2,4]' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'Pages deleted' } }
      }
    },
    '/tools/pdf/organize': {
      post: {
        summary: 'Organize PDF pages (atomic reorder, rotate and delete)',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' },
                  operations: { type: 'string', description: 'JSON array of [{ pageNumber, rotation, deleted }]' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'PDF organized' } }
      }
    },
    '/tools/pdf/crop': {
      post: {
        summary: 'Crop PDF page margins',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' },
                  top: { type: 'number' },
                  bottom: { type: 'number' },
                  left: { type: 'number' },
                  right: { type: 'number' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'PDF cropped' } }
      }
    },
    '/tools/pdf/add-page-numbers': {
      post: {
        summary: 'Add page numbers to PDF with custom positioning and format',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' },
                  format: { type: 'string', enum: ['page_of_total', 'number_only', 'page_number'] },
                  position: { type: 'string', enum: ['bottom-center', 'bottom-right', 'bottom-left', 'top-center', 'top-right', 'top-left'] },
                  fontSize: { type: 'number' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'Page numbers added' } }
      }
    },
    '/tools/pdf/add-watermark': {
      post: {
        summary: 'Add text watermark to PDF pages',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' },
                  text: { type: 'string' },
                  opacity: { type: 'number' },
                  rotationDegrees: { type: 'number' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'Watermark added' } }
      }
    },
    '/tools/pdf/protect': {
      post: {
        summary: 'Protect PDF with user & owner password encryption',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['password'],
                properties: {
                  files: { type: 'string', format: 'binary' },
                  password: { type: 'string' },
                  ownerPassword: { type: 'string' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'PDF encrypted and protected' } }
      }
    },
    '/tools/pdf/unlock': {
      post: {
        summary: 'Unlock password-protected PDF with authorized password',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['password'],
                properties: {
                  files: { type: 'string', format: 'binary' },
                  password: { type: 'string' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'PDF decrypted and unlocked' } }
      }
    },
    '/tools/convert/csv-to-excel': {
      post: {
        summary: 'Convert CSV to formatted Excel XLSX spreadsheet',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'CSV converted to Excel' } }
      }
    },
    '/tools/convert/excel-to-csv': {
      post: {
        summary: 'Convert Excel XLSX workbook to clean CSV format',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'Excel converted to CSV' } }
      }
    },
    '/tools/convert/word-to-html': {
      post: {
        summary: 'Convert Word DOCX document to semantic HTML',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'Word converted to HTML' } }
      }
    },
    '/tools/convert/txt-to-pdf': {
      post: {
        summary: 'Convert plain text TXT file to paginated PDF document',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'TXT converted to PDF' } }
      }
    },
    '/tools/convert/word-to-pdf': {
      post: {
        summary: 'Convert Word (.docx/.doc) to PDF via LibreOffice headless adapter',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'Word converted to PDF' } }
      }
    },
    '/tools/convert/pdf-to-word': {
      post: {
        summary: 'Convert PDF to Word DOCX via LibreOffice adapter',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'PDF converted to Word' } }
      }
    },
    '/tools/convert/excel-to-pdf': {
      post: {
        summary: 'Convert Excel (.xlsx/.xls) to PDF via LibreOffice adapter',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'Excel converted to PDF' } }
      }
    },
    '/tools/convert/pdf-to-excel': {
      post: {
        summary: 'Convert PDF to Excel XLSX via LibreOffice adapter',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'PDF converted to Excel' } }
      }
    },
    '/tools/convert/powerpoint-to-pdf': {
      post: {
        summary: 'Convert PowerPoint (.pptx/.ppt) to PDF via LibreOffice adapter',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'PowerPoint converted to PDF' } }
      }
    },
    '/tools/convert/pdf-to-powerpoint': {
      post: {
        summary: 'Convert PDF to PowerPoint PPTX via LibreOffice adapter',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'PDF converted to PowerPoint' } }
      }
    },
    '/tools/convert/html-to-pdf': {
      post: {
        summary: 'Convert HTML document to PDF',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'HTML converted to PDF' } }
      }
    },
    '/tools/convert/rtf-to-pdf': {
      post: {
        summary: 'Convert RTF document to PDF',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: { type: 'string', format: 'binary' }
                }
              }
            }
          }
        },
        responses: { '200': { description: 'RTF converted to PDF' } }
      }
    },
    '/tools/convert/capabilities': {
      get: {
        summary: 'Get conversion engines capability report and supported format matrix',
        responses: { '200': { description: 'Conversion engine capabilities returned' } }
      }
    },
    '/jobs/{jobId}': {
      get: {
        summary: 'Get processing job status and progress',
        parameters: [
          {
            name: 'jobId',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': { description: 'Job status details' },
          '404': { description: 'Job not found' }
        }
      }
    },
    '/jobs/{jobId}/download': {
      get: {
        summary: 'Download completed output file for a job',
        parameters: [
          {
            name: 'jobId',
            in: 'path',
            required: true,
            schema: { type: 'string' }
          }
        ],
        responses: {
          '200': {
            description: 'File binary stream',
            content: {
              'application/octet-stream': {
                schema: { type: 'string', format: 'binary' }
              }
            }
          },
          '404': { description: 'File not found or expired' }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  }
};
