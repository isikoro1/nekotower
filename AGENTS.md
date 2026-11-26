# Agent instructions

このリポジトリで作業するAIエージェント向けの入口です。

## 最優先

- 既存のソロゲームを壊さない。
- オンライン対戦は安全に段階導入する。
- Firebase設定値や秘密情報をコミットしない。
- 課金が発生する構成へ勝手に切り替えない。
- ユーザーが作った素材や変更を勝手に削除しない。
- 自宅PCを外部公開する構成にしない。
- `curl | bash`、不明な `.exe`、出所不明なCLIを導入しない。
- FirebaseのDatabase Rulesを緩める変更は、理由と影響を明記してから行う。

## 継続開発の入口

- 現行仕様は`docs/spec.md`、構造は`docs/architecture.md`、検証は`docs/testing.md`。
- 要望は`docs/requests.md`、共通AI方針は`docs/ai-development-guidelines.md`。
- 文書全体の入口は`docs/README.md`。作業に必要なファイルから読む。
- 仕様変更・重要な判断・受入条件をコードと同じコミットで更新する。
- 既存文書の歴史的記述と現行仕様を混同しない。
- キャッチコピーを追加しない。コメントは理由・制約を中心にする。
- CPUは`src/cpu-player.js`、モード遷移は`src/game.js`。CPU戦は端末内で完結する。
- 待機中CPUはCPUと明示する。切断代行の表示方針とは別扱い。

## 作業前に読む

- `docs/safety-first-online-plan.md`
- `docs/online-battle-design.md`
- `docs/firebase-setup-checklist.md`
- `docs/source-understanding.md`
- `docs/ai/agent-brief.md`

## オンライン対戦の基本方針

- 2人対戦から始める。
- 物理演算はホスト端末を正にする。
- Firebase設定がない場合、オンライン機能はOFFにする。
- 切断時は内部的に自動操作へ切り替えるが、UIではCPUとは表示しない。
- 混雑時は待機列、推定待ち時間、通知で対応する。
- FirebaseはSpark無料プランを前提にし、Blaze前提の実装にしない。

## 検証

変更後は可能な限り実行する。

```powershell
node --check src\game.js
node tests\smoke-test.js
node tests\cpu-player-test.js
node tests\cpu-search-test.js
node tests\cpu-strength-test.js
node tests\matchmaking-lifecycle-test.js
node tests\online-bootstrap-test.js
```
