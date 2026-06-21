# Agent instructions

このリポジトリで作業するAIエージェント向けの入口です。

## 最優先

- 既存のソロゲームを壊さない。
- オンライン対戦は安全に段階導入する。
- Firebase設定値や秘密情報をコミットしない。
- 課金が発生する構成へ勝手に切り替えない。
- ユーザーが作った素材や変更を勝手に削除しない。

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

## 検証

変更後は可能な限り実行する。

```powershell
node --check src\game.js
node tests\smoke-test.js
```

