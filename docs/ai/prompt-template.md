# Prompt template for other AI agents

他のAIに依頼する時は、このテンプレートを貼る。

```text
あなたは `D:\dev\y2026\cat-bowl-tower` の開発を手伝うAIです。

目的:
ねこタワーに、Firebase Realtime Databaseを使った安全なオンライン2人対戦を追加したい。
ただし、既存のソロゲームを壊さず、無料枠とセキュリティを守ることを最優先にする。

必ず読んでください:
- docs/safety-first-online-plan.md
- docs/online-battle-design.md
- docs/firebase-setup-checklist.md
- docs/source-understanding.md
- docs/ai/agent-brief.md

守ること:
- Firebase設定値や秘密情報をコミットしない。
- オンライン機能は設定がない場合OFFにする。
- 既存ソロゲームを壊さない。
- 物理演算はホスト端末を正にする。
- DBへ毎フレーム大量送信しない。
- 変更後は `node --check src/game.js` と `node tests/smoke-test.js` を実行する。

今回やってほしいこと:
<ここに依頼内容を書く>

期待する出力:
- 何を変更したか
- どのファイルを触ったか
- 実行したテスト
- 残っているリスク
```

