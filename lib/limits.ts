/**
 * 入力の上限（サーバーの検証と画面の maxLength で共有する）
 */

export const LIMITS = {
  groupNameMax: 50,
  memberNameMax: 20,
  titleMax: 50,
  membersMin: 2,
  membersMax: 30,
  /** 1 グループあたりの支払いの件数 */
  paymentsMax: 1000,
  /** 金額の上限（元の通貨の最小単位、円換算後の円の両方に適用） */
  amountMax: 1_000_000_000_000,
  /** 手動で入力できるレートの上限（1 通貨あたり 100 万円） */
  rateMax: 1_000_000,
} as const;
