import type OpenAI from 'openai';

export const agentTools: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'update_prd_section',
      description: '更新 PRD 的某個章節內容。當你從對話中收集到足夠資訊填入某個 PRD 欄位時呼叫此工具。',
      parameters: {
        type: 'object',
        properties: {
          sectionKey: {
            type: 'string',
            enum: [
              'background', 'users', 'scope', 'asIs', 'toBe',
              'userStories', 'acceptance', 'dataModel', 'permissions',
              'nonFunctional', 'kpi', 'risks', 'mvpScope',
            ],
            description: 'PRD 章節的 key',
          },
          content: {
            type: 'string',
            description: 'Markdown 格式的章節內容',
          },
        },
        required: ['sectionKey', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'summarize_conversation',
      description: '摘要目前的對話重點、已做的決定、以及尚待釐清的問題。每 3-5 輪對話後主動呼叫。',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: '對話摘要（bullet points）' },
          keyDecisions: {
            type: 'array',
            items: { type: 'string' },
            description: '已確認的關鍵決定',
          },
          openQuestions: {
            type: 'array',
            items: { type: 'string' },
            description: '尚待釐清的問題',
          },
        },
        required: ['summary'],
      },
    },
  },
];
