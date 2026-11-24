# 検証手順

リポジトリ直下で実行する。

```sh
node --check src/game.js
node --check src/online/online-bootstrap.js
node --check src/cpu-player.js
node tests/smoke-test.js
node tests/online-bootstrap-test.js
node tests/cpu-player-test.js
node tests/matchmaking-lifecycle-test.js
```

- smoke-test: ソロ4ステージ・移動・回転・落下・CPUの交代/自動落下/勝敗/再戦・待機との併存・遅延成立拒否・オンライン移行・通信失敗。
- online-bootstrap-test: Firebase設定なし/設定ありの初期状態。
- cpu-player-test: 狙う位置・制限範囲・落下時刻。乱数を固定する。
- matchmaking-lifecycle-test: 待機更新・取消・成立・同期コールバック・登録中の取消・タイムアウト・通信失敗。実DBには接続しない。

## ブラウザ確認

1. CPU対戦を開始、人間が落とした後にCPUが自動で落とす。
2. CPUの手番で人間が操作できない。勝敗後にCPU戦を再開できる。
3. オンライン開始直後にCPU戦が遊べる。待機状況とCPUの手番を区別できる。
4. 待機取消後もCPU戦が続く。CPU戦リトライで待機が重複しない。
5. スマホ幅でタイトル・操作ボタン・遊び方・結果画面が使える。
6. 実Firebaseの確認が可能なときだけ、2端末でマッチ成立・CPU停止・対戦開始を確認する。

オンライン待機を使う検証では、終了時に待機を取り消す。
実2端末検証を行っていない場合は、モックでの検証と区別して報告する。

## 2026-11-24の実施記録

上記4本の自動テストが成功。ブラウザでCPU戦の開始、人間の落下後にCPUが自動落下して
3匹目へ進むことを確認。390px幅でオンライン待機とCPUモードの併存、待機取消後の
CPU戦継続を確認した。実Firebaseでの2端末マッチ成立は未検証で、切替はモックで検証した。
