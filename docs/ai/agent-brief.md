# Agent brief for online battle work

このファイルは、Codex、ChatGPT、Claude Code、Geminiなど別のAIに作業を依頼する時の共通ブリーフです。
作業前に必ず読むこと。

## プロジェクト

- 名前: ねこタワー
- 目的: 変な形の猫を物理演算で積むWebゲーム
- 公開: GitHub Pages
- 主要技術: plain HTML/CSS/JavaScript, Matter.js
- 現在の最重要目標: 安全にオンライン2人対戦を試作する

## 重要な安全方針

- 既存のソロゲームを壊さない。
- オンライン機能は設定がない場合に無効化する。
- Firebase設定値や秘密情報をコミットしない。
- 課金が発生する構成に勝手に切り替えない。
- 無料枠を守るため、人数制限、ルーム寿命、待機列上限を入れる。
- 物理演算の完全同期を狙わない。ホスト端末を正にする。
- 既存のユーザー作業や素材を勝手に削除しない。

## 必ず読むファイル

- `docs/safety-first-online-plan.md`
- `docs/online-battle-design.md`
- `docs/firebase-setup-checklist.md`
- `docs/source-understanding.md`
- `src/game.js`
- `tests/smoke-test.js`

## 実装の基本方針

- オンライン関連は `src/online/` に分ける。
- `src/game.js` は必要最小限の接続点だけ変更する。
- Firebaseが使えない環境でもソロゲームが動くようにする。
- 最初は2人対戦だけ。
- 切断時は内部的に自動操作へ切り替えるが、UIではCPUとは表示しない。
- 混雑時は待機時間表示と通知を用意する。

## 禁止事項

- 実Firebase設定値をコミットする。
- Firebase Rulesを公開前提で全面読み書き可にする。
- 大量のDB書き込みを毎フレーム行う。
- `git reset --hard`、不要な削除、無関係な大規模リファクタ。
- オンライン対戦のために既存のソロゲームを後回しに壊す。

## 推奨作業順

1. ドキュメントを読む。
2. `git status` を確認する。
3. 小さな変更単位で進める。
4. `node --check src/game.js` を実行する。
5. `node tests/smoke-test.js` を実行する。
6. 変更内容と残リスクを短く報告する。

## ユーザーの意図

ユーザーはオンライン対戦を早く形にして試したい。
ただし、致命的な破壊、課金事故、セキュリティ事故、AIが勝手に危険な作業をすることを避けたい。
説明は専門用語だけでなく、判断できる粒度で具体的に書く。

