// 👶 오늘의 육아정보 — 월령·분야·주제 라이브러리 (해피해피 계정). DOM 의존성 없음.
export const AGE_BANDS = [
  { k: 'prep', label: '임신·출산 준비' }, { k: '0-3', label: '0~3개월' }, { k: '4-6', label: '4~6개월' },
  { k: '7-9', label: '7~9개월' }, { k: '10-12', label: '10~12개월' }, { k: '13-24', label: '13~24개월' }, { k: '25+', label: '25개월 이상' },
];
export const GROUPS = { food: '이유식·영양', feeding: '수유', health: '알레르기·건강', oral: '구강', sleep: '수면', dev: '발달·놀이', safety: '안전', policy: '제도·지원금' };
export const ageLabel = (k) => AGE_BANDS.find((a) => a.k === k)?.label || '';
export const groupLabel = (k) => GROUPS[k] || '';

// 주제 제목과 질문만 담는다. 의학·영양 내용은 앱이 정하지 않고, 만들 때 AI가 공식 자료에서 찾아 출처와 함께 쓴다.
export const SEED_TOPICS = [
  { id: 'seed-solid-start', title: '이유식, 언제 시작하면 될까요?', age: '4-6', group: 'food', format: 'info_check', question: '이유식은 몇 개월부터, 어떤 신호가 있을 때 시작하나요?' },
  { id: 'seed-solid-caution', title: '이유식 시작할 때 주의할 점', age: '4-6', group: 'food', format: 'info_top', question: '이유식을 처음 시작할 때 조심해야 할 것은 무엇인가요?' },
  { id: 'seed-solid-allergy', title: '이유식 알레르기 반응, 어떻게 살필까요?', age: '4-6', group: 'health', format: 'info_qa', question: '새 음식을 먹이고 알레르기 반응을 어떻게 확인하나요?' },
  { id: 'seed-milk', title: '우유는 언제부터 먹일 수 있나요?', age: '10-12', group: 'food', format: 'info_qa', question: '생우유는 몇 개월부터, 얼마나 먹일 수 있나요?' },
  { id: 'seed-before-1yr-food', title: '돌 전 아기, 조심해야 할 음식', age: '10-12', group: 'food', format: 'info_top', question: '돌 전 아기에게 주의해야 하는 음식은 무엇인가요?' },
  { id: 'seed-brushing', title: '아기 양치질, 언제부터 어떻게?', age: '7-9', group: 'oral', format: 'info_qa', question: '아기 양치는 언제 시작하고 어떻게 해 주나요?' },
  { id: 'seed-breastfeeding', title: '모유수유 꼭 알아둘 정보', age: '0-3', group: 'feeding', format: 'info_qa', question: '모유수유에서 엄마들이 가장 많이 궁금해하는 것은 무엇인가요?' },
  { id: 'seed-formula', title: '분유 타는 방법과 보관', age: '0-3', group: 'feeding', format: 'info_check', question: '분유는 어떻게 타고, 남은 분유는 어떻게 하나요?' },
  { id: 'seed-sleep', title: '아기 수면 습관, 언제부터 잡을까요?', age: '4-6', group: 'sleep', format: 'info_qa', question: '아기 수면 습관은 언제부터 어떻게 잡나요?' },
  { id: 'seed-safe-sleep', title: '아기가 안전하게 자는 환경', age: '0-3', group: 'safety', format: 'info_check', question: '아기가 자는 환경에서 확인할 것은 무엇인가요?' },
  { id: 'seed-fever', title: '아기 열이 날 때 확인할 것', age: '7-9', group: 'health', format: 'info_check', question: '아기가 열이 날 때 무엇을 확인하고 언제 병원에 가나요?' },
  { id: 'seed-vaccine', title: '영유아 예방접종, 일정 챙기기', age: '0-3', group: 'health', format: 'info_qa', question: '영유아 예방접종 일정은 어떻게 확인하나요?' },
  { id: 'seed-checkup', title: '영유아 건강검진, 언제 받나요?', age: '0-3', group: 'policy', format: 'info_qa', question: '영유아 건강검진은 언제, 어디서 받나요?' },
  { id: 'seed-parent-pay', title: '부모급여·아동수당 신청 방법', age: 'prep', group: 'policy', format: 'info_check', question: '부모급여와 아동수당은 어떻게 신청하나요?' },
  { id: 'seed-development', title: '뒤집기·기기·걷기, 발달 시기', age: '4-6', group: 'dev', format: 'info_qa', question: '뒤집기·기기·걷기는 보통 언제 하나요?' },
  { id: 'seed-stool', title: '아기 변 색깔·횟수, 어디까지 괜찮을까?', age: '0-3', group: 'health', format: 'info_qa', question: '아기 변의 색깔과 횟수는 어떤 경우에 확인해야 하나요?' },
];

const read = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const key = (pid) => `moa.careTopics.${pid}`;
const fresh = (t) => ({ status: 'todo', contentIds: [], checkedAt: '', question: '', ...t });

// 계정별 주제함. 나중에 추가된 기본 주제는 자동으로 합친다
export function loadTopics(pid) {
  const list = read(key(pid), []);
  const have = new Set(list.map((t) => t.id));
  const merged = [...list, ...SEED_TOPICS.filter((t) => !have.has(t.id)).map(fresh)];
  if (merged.length !== list.length) write(key(pid), merged);
  return merged;
}
export const saveTopics = (pid, list) => write(key(pid), list);
export function addTopic(pid, t) {
  const list = loadTopics(pid);
  const topic = fresh({ id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, format: 'info_qa', age: '4-6', group: 'food', ...t });
  list.push(topic); saveTopics(pid, list);
  return topic;
}
export function removeTopic(pid, id) { saveTopics(pid, loadTopics(pid).filter((t) => t.id !== id)); }
export function markTopicDone(pid, topicId, contentId, checkedAt) {
  const list = loadTopics(pid);
  const t = list.find((x) => x.id === topicId);
  if (!t) return;
  t.status = 'done'; t.checkedAt = checkedAt; t.contentIds = [contentId, ...(t.contentIds || [])].slice(0, 10);
  saveTopics(pid, list);
}
// 이번 주 추천: 아직 안 만든 주제를 주차마다 돌려 가며 n개 (같은 주에는 같은 추천)
export function weekNumber(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 864e5 + 1) / 7);
}
export function weeklyPick(topics, now = new Date(), n = 3) {
  const todo = topics.filter((t) => t.status !== 'done');
  if (!todo.length) return [];
  const start = (weekNumber(now) * n) % todo.length;
  return Array.from({ length: Math.min(n, todo.length) }, (_, i) => todo[(start + i) % todo.length]);
}
