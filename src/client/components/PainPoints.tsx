import React from 'react';

const points = [
  {
    icon: '🔄',
    title: '流程卡關',
    desc: '明明知道哪裡有問題，但就是找不到好的解法，每天耗時在重複性工作上。',
  },
  {
    icon: '🧩',
    title: '工具散亂',
    desc: 'Excel、Line、Email、紙本來回切換，資訊斷層讓效率打折扣。',
  },
  {
    icon: '🤔',
    title: '轉型無從下手',
    desc: '知道要數位轉型，但不確定從哪裡開始，怕投入成本卻看不到效果。',
  },
  {
    icon: '🤖',
    title: 'AI 只聞其名',
    desc: '聽過 AI 很強大，但不知道怎麼應用在自己的業務上，擔心只是跟風。',
  },
];

export function PainPoints() {
  return (
    <section className="section pain-points" id="pain-points">
      <div className="container">
        <h2 className="section-title reveal">
          這些問題，<span className="highlight">聽起來熟悉嗎？</span>
        </h2>
        <p className="section-subtitle reveal">
          許多企業都面臨同樣的挑戰，差別只在於——有沒有人幫你把問題變成解法。
        </p>

        <div className="card-grid">
          {points.map((p, i) => (
            <div className="card reveal" key={i} style={{ animationDelay: `${i * 0.1}s` }}>
              <span className="card-icon">{p.icon}</span>
              <h3 className="card-title">{p.title}</h3>
              <p className="card-desc">{p.desc}</p>
            </div>
          ))}
        </div>

        <div className="pain-points-cta reveal">
          <p className="pain-points-cta-text">
            不確定該怎麼描述？讓 AI 助手用對話幫你整理
          </p>
          <a href="#voice-intake" className="btn btn-outline pain-points-cta-btn">
            用說的，更簡單
          </a>
        </div>
      </div>
    </section>
  );
}
