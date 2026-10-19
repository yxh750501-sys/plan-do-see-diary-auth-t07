# 플랜두씨 다이어리 (T06)

로그인 없이 공유되는 Plan → Do → See 다이어리. 모든 계획, 수정 이력, 할 일, 실행 기록, 돌아보기 근거는 서버의 Cloudflare D1에 저장됩니다. 공개해도 괜찮은 내용만 입력해야 합니다.

## 구조

- `worker/index.js`: D1 API, 검증, 집계, 동시 완료 중복 방지
- `src/`: 첫 화면과 브라우저 상호작용. 사용자 글은 `textContent`로 표시
- `db/schema.ts`와 `drizzle/`: D1 스키마와 고정 SQL 마이그레이션
- `contracts/pds-schema-v2.json`: 표·관계·날짜·집계 규칙
- `tests/integration.mjs`: SQLite를 사용한 API 통합 검사

## 로컬 확인

Node.js 24 이상에서 `npm ci`, `npm run build`, `npm run check`, `node tests/integration.mjs`를 실행합니다. 브라우저 확인은 `node scripts/preview.mjs` 뒤 `http://127.0.0.1:4173/`에서 합니다. 미리보기 DB는 메모리 데이터라 종료하면 비워집니다. 공개 서비스 DB와 분리됩니다.

## API

- `GET /api/snapshot`, `GET /api/export`
- `POST /api/plans`, `PATCH /api/plans/:id`, `POST /api/plans/:id/next`
- `POST /api/tasks`, `PATCH /api/tasks/:id`, `DELETE /api/tasks/:id`
- `POST /api/tasks/:id/complete`, `POST /api/tasks/:id/reopen`
- `POST /api/logs`

완료 이벤트는 `completion_events.task_id`의 고유키로 중복을 방지합니다. 돌아보기의 완료 수는 현재 완료 상태의 할 일 수로 계산합니다. 삭제는 표시 목록에서 제외하는 소프트 삭제이며, JSON 내보내기에는 삭제 행도 포함합니다.
