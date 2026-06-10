# BJC Member Referral Binary Smoke Test Plan V1

## 1. 목적

이 문서는 회원가입/로그인/추천인/sponsor closure/바이너리 레그 구조 도입 후 최소 기능을 실제 MySQL + API 기준으로 검증하기 위한 smoke test 계획을 정리한다.

범위:

- auth
- sponsor 관계 생성
- referral closure 생성
- binary placement
- 자기 조직도 조회
- 관리자 조직도 조회
- binary leg 응답 필드 검증

비범위:

- 실제 계산 엔진 자동 계산
- 대규모 프론트 E2E

---

## 2. 테스트 환경 가정

- MySQL 스키마에 `accounts` 확장, `binary_nodes`, `binary_edges` 반영 완료
- auth/session 또는 JWT 운영형 인증 최소 구현 완료
- 개발/smoke에서는 필요 시 `x-actor-account-id` fallback 허용
- 테스트 계정 준비:
  - `ADMIN`
  - `READER`
  - sponsor 역할의 `USER`
  - sponsor 하위 가입용 `USER` 다수

예시 역할 표현:

- `ADMIN actor id`: `accounts.role = 'ADMIN'`
- `READER actor id`: `accounts.role = 'READER'`
- `USER actor id`: `accounts.role = 'USER'`

---

## 3. 사전 데이터 준비

## 3.1 기본 계정

- 운영 관리자 1명
- 조회 관리자 1명
- sponsor USER 1명
- binary 테스트용 USER 다수

## 3.2 사전 상태

- sponsor 계정은 `referral_code` 보유
- sponsor 계정은 binary root 또는 parent 후보
- `status = ACTIVE`

## 3.3 검증 데이터

- 고유 `login_id`
- 존재하지 않는 `referral_code`
- 올바른 `referral_code`
- 중복 배치 유도 계정 세트

---

## 4. 테스트 카테고리

## 4.1 회원가입 / 인증

### T01 회원가입 성공

- 목적: 정상 가입 + sponsor 연결 + binary 자동 배치
- 입력:
  - 유효한 `login_id`
  - 유효한 `password`
  - 유효한 `display_name`
  - 유효한 `referral_code`
- 기대 결과:
  - `201` 또는 `200`
  - `accounts` row 생성
  - `sponsor_account_id` 설정
  - `binary_parent_account_id`, `binary_position` 설정
  - `referral_edges` 생성
  - `binary_nodes`, `binary_edges` 생성

### T02 중복 `login_id` 실패

- 목적: 계정 중복 방지
- 기대 결과:
  - `409`
  - 신규 row 미생성

### T03 없는 추천 코드 실패

- 목적: sponsor 필수 검증
- 기대 결과:
  - `404` 또는 `422`
  - 신규 row 미생성

### T04 추천 코드 정상 조회

- 대상 API: `GET /api/referrals/resolve`
- 기대 결과:
  - `200`
  - `referral_code_valid = true`
  - sponsor 계정 정보 반환

### T05 로그인 성공

- 대상 API: `POST /api/auth/login`
- 기대 결과:
  - `200`
  - session 또는 token 발급
  - `last_login_at` 갱신

### T06 로그인 실패

- 잘못된 비밀번호
- 기대 결과:
  - `401`

### T07 BLOCKED 회원 로그인 실패

- 계정 상태를 `BLOCKED`로 변경 후 시도
- 기대 결과:
  - `403`

### T08 auth/me 성공

- 인증된 세션 또는 fallback actor로 호출
- 기대 결과:
  - `200`
  - 현재 계정 정보 반환

---

## 4.2 권한 / 자기 정보 보호

### T09 USER가 자기 정보 조회 성공

- 대상:
  - `GET /api/auth/me`
  - `GET /api/me/referral-tree`
  - `GET /api/me/binary-tree`
- 기대 결과:
  - `200`

### T10 USER가 남의 정보 조회 실패

- 대상:
  - `GET /api/admin/accounts/:accountId`
  - 타 계정 tree API
- 기대 결과:
  - `403`

### T11 ADMIN이 회원 목록 조회 성공

- 대상 API: `GET /api/admin/accounts`
- 기대 결과:
  - `200`
  - pagination 응답 정상

### T12 READER가 회원 목록 조회 성공 또는 정책 제한

기본 권장 정책:

- `READER` 조회 허용

기대 결과:

- 허용 정책이면 `200`
- 제한 정책이면 `403`

이번 V1 권장 계약 기준:

- `200`

---

## 4.3 sponsor / referral closure

### T13 추천인 sponsor 관계 생성 확인

- 회원가입 후 `accounts.sponsor_account_id` 확인
- 기대 결과:
  - sponsor가 정확히 저장됨

### T14 referral_edges 1대 생성 확인

- sponsor -> child
- 기대 결과:
  - `depth = 1` row 존재

### T15 referral_edges 2대 생성 확인

시나리오:

- A sponsor B
- B sponsor C

기대 결과:

- `A -> B depth 1`
- `B -> C depth 1`
- `A -> C depth 2`

### T16 referral_edges 3대 생성 확인

시나리오:

- A sponsor B
- B sponsor C
- C sponsor D

기대 결과:

- `A -> D depth 3`
- closure 전체 정상 생성

### T17 자기 자신 추천 실패

- 자신의 `referral_code`로 가입 시도
- 기대 결과:
  - `422` 또는 `409`

---

## 4.4 binary placement

### T18 바이너리 LEFT 배치 성공

조건:

- sponsor 하위 `LEFT` 비어 있음

기대 결과:

- `binary_position = LEFT`
- `binary_parent_account_id = sponsor`
- `binary_nodes` row 생성

### T19 바이너리 RIGHT 배치 성공

조건:

- 같은 sponsor 하위 `LEFT` 이미 점유
- `RIGHT` 비어 있음

기대 결과:

- `binary_position = RIGHT`

### T20 LEFT 중복 배치 실패

조건:

- 특정 parent에 LEFT가 이미 존재
- 수동 배치 또는 충돌 유도

기대 결과:

- `409`
- duplicate row 미생성

### T21 RIGHT 중복 배치 실패

- 기대 결과:
  - `409`

### T22 자동 하위 배치 성공

조건:

- sponsor 하위 LEFT/RIGHT 모두 차 있음

기대 결과:

- 하위 depth에서 deterministic한 빈자리 선택
- 같은 입력 재시도 시 결과 동일

### T23 순환 배치 실패

시나리오:

- 조상을 자손 하위로 재배치하려고 시도

기대 결과:

- `422` 또는 `409`
- binary 구조 불변

---

## 4.5 조직도 조회

### T24 USER 자기 referral-tree 조회 성공

- 대상 API: `GET /api/me/referral-tree`
- 기대 결과:
  - `200`
  - 본인 root 기준 응답

### T25 USER 자기 binary-tree 조회 성공

- 대상 API: `GET /api/me/binary-tree`
- 기대 결과:
  - `200`
  - left/right children 구조 포함

### T26 ADMIN 특정 회원 referral-tree 조회 성공

- 대상 API: `GET /api/admin/accounts/:accountId/referral-tree`
- 기대 결과:
  - `200`

### T27 ADMIN 특정 회원 binary-tree 조회 성공

- 대상 API: `GET /api/admin/accounts/:accountId/binary-tree`
- 기대 결과:
  - `200`

### T28 binary-legs LEFT/RIGHT 매출 필드 응답 확인

- 대상 API:
  - `GET /api/me/binary-legs`
  - `GET /api/admin/accounts/:accountId/binary-legs`

필수 확인 필드:

- `left_volume_base`
- `right_volume_base`
- `weak_leg_volume_base`
- `total_stake_amount_base`
- `total_sales_amount_base`
- `total_reward_amount_base`

기대 결과:

- 모든 수치 필드가 string
- `weak_leg_volume_base = min(left_volume_base, right_volume_base)`

---

## 5. DB 검증 포인트

각 테스트에서 함께 확인할 항목:

- `accounts` row 생성/갱신
- `referral_edges` closure depth
- `binary_nodes.parent_account_id`
- `binary_nodes.position`
- `binary_edges.depth`
- `binary_edges.root_leg`
- `last_login_at`
- auth session row 생성/무효화 여부

---

## 6. 트랜잭션 / rollback 확인

## 6.1 회원가입 rollback

검증:

- sponsor 또는 binary 단계 실패 시 `accounts` insert도 rollback 되는지 확인

### T29 회원가입 중 binary 충돌 발생 시 전체 rollback

- 기대 결과:
  - `accounts` row 없음
  - `referral_edges` 없음
  - `binary_nodes` 없음

## 6.2 수동 배치 rollback

### T30 binary placement 실패 시 구조 불변

- 기대 결과:
  - 기존 `binary_nodes`, `binary_edges` unchanged

---

## 7. HTTP status 기대치 요약

- `200` 조회/로그인/정상 placement
- `201` 회원가입 성공 시 선택 가능
- `401` 인증 실패
- `403` 권한 없음 / BLOCKED login
- `404` 없는 추천 코드 / 없는 회원
- `409` 중복 `login_id`, slot conflict, already placed
- `422` validation, cycle, invalid query
- `500` 서버 오류

---

## 8. 실행 순서 제안

1. 추천 코드 resolve
2. 회원가입 성공/실패
3. 로그인 성공/실패
4. auth/me
5. sponsor closure 검증
6. binary placement 검증
7. me tree 조회
8. admin tree 조회
9. binary legs 응답 필드 검증

---

## 9. 자동화 형태 제안

1차 권장:

- repository/service unit test
- API smoke script
- 실제 MySQL 연결 smoke

추천 파일:

- `src/services/authService.test.ts`
- `src/services/referralService.test.ts`
- `src/services/binaryPlacementService.test.ts`
- `scripts/member_referral_binary_smoke.ts`

---

## 10. 합격 기준

아래가 모두 만족되면 1차 smoke 통과로 본다.

- 회원가입 성공
- 중복 가입 차단
- 추천 코드 resolve 정상
- 로그인/auth/me 정상
- BLOCKED 로그인 차단
- sponsor closure 1/2/3 depth 생성
- LEFT/RIGHT 배치 규칙 준수
- 자동 하위 배치 deterministic
- cycle 방지
- USER 자기 조회 성공 / 타인 조회 차단
- ADMIN/READER 조회 정책 준수
- `binary-legs`의 매출/볼륨 필드가 string으로 반환

---

## 11. 다음 단계 연결

이 smoke plan이 통과하면 다음 단계로 넘어간다.

1. User Front 회원가입/로그인/내 조직도 구현
2. Admin Front 회원/추천/바이너리 관리 구현
3. 그 다음 계산 엔진 입력으로 sponsor/binary 구조 연결
