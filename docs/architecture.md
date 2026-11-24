# 構造と設計判断

| ファイル | 責務 |
| --- | --- |
| index.html | canvas・タイトル・モード選択・操作UI・script読込順 |
| styles.css / theme.css | 既存の基礎表示 / 追加の外観 |
| src/game.js | 物理、入力、描画、盤面の状態、モード切替 |
| src/cpu-player.js | 積まれた猫の位置からCPUの狙い・角度・落下時刻を計画する純粋な処理 |
| src/online/online-bootstrap.js | Firebase初期化、待機キュー、待機取消、ルーム監視・更新 |
| src/cats.js / cat-*.js | 素材リストと当たり判定 |

## CPU対戦

`state.cpu`でactive、turn（human/cpu）、plan、noticeを持つ。
`startCpuBattle`が盤面を作り、`nextTurn`で手番を交代する。
`updateLocalCpu`は既存のフレーム更新から呼び出し、同じMatter.js bodyを操作する。
別タイマー・別物理エンジンを設けず、手番・落下・カメラの状態を二重管理しない。
計画関数に乱数と時刻を渡せるため、狙い範囲と待ち時間を再現して検証できる。

CPUの行動は`state.online.comAi`の切断代行と分離する。
人間側の入力入口（照準、落下、ホイール）は手番を確認する。

## マッチ待機と遷移

待機はCPUゲームと独立した状態。CPU戦のresetやリトライではキューを再登録しない。
マッチ成立時はCPUの状態と盤面を捨て、既存のstartOnlineSessionへ渡す。

ゲーム側の`matchmakingRequest`で取り消し済み要求の結果を無効化する。
通信側の`matchGeneration`で初期化中・登録中の取り消しを識別し、
待機リスナー・タイムアウト・ハートビートを一箇所で解除する。
CPU戦は通信終了を待たずに開始し、通信失敗時も遊べるようにする。

## 今回維持したもの

Matter.jsの定数、猫の形状、ステージ、既存のオンライン同期・切断代行・連勝記録。
全面的なリファクタリングや依存追加は行わない。

## 残る課題

- CPU難易度・勝率の調整は実プレイを見て改善する。
- 既存マッチングの複数クライアントによる同時ルーム作成は今回全面改修していない。
- モックの結合テストは実Firebaseの2端末対戦の代替にはならない。
