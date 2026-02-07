import type OpenAI from 'openai';

export const intakeTools: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'update_intake',
      description: '更新結構化痛點分析。當你從對話中收集到足夠資訊可填入某個欄位時呼叫此工具。可一次更新多個欄位。',
      parameters: {
        type: 'object',
        properties: {
          background: {
            type: 'string',
            description: '公司/團隊背景（做什麼的、規模、產業）',
          },
          currentState: {
            type: 'string',
            description: '現況工作方式（使用的工具、流程）',
          },
          painPoints: {
            type: 'string',
            description: '具體痛點（卡在哪、花多少時間、造成什麼問題）',
          },
          expectedOutcome: {
            type: 'string',
            description: '期望的改善（理想狀態、量化目標）',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_complete',
      description: '標記痛點分析完成。當 4 個欄位都有足夠內容時呼叫此工具。',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: '一段簡短的需求摘要（2-3 句話）',
          },
        },
        required: ['summary'],
      },
    },
  },
];
