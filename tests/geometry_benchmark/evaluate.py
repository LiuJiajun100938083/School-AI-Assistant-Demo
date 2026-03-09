#!/usr/bin/env python3
"""
幾何識別評測腳本

用法：
  python tests/geometry_benchmark/evaluate.py [--fixtures-dir DIR] [--output DIR]

評測指標：
- 題幹/答案 OCR 字符準確率（編輯距離）
- 圖形存在檢測 F1
- 元素識別 F1（按 object type 分組）
- 關係識別 F1（按 relationship type 分組）
- 量測識別準確率
- AI 分析可用率（error_type 正確率 + correct_answer 含關鍵詞率）
- readable_description_quality（包含關鍵對象/量測/關係，正確區分 inferred）
"""

import json
import os
import sys
import glob
import argparse
from datetime import datetime
from typing import Dict, List, Any, Optional

# 添加項目根目錄
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


def edit_distance(s1: str, s2: str) -> int:
    """Levenshtein 編輯距離"""
    m, n = len(s1), len(s2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if s1[i - 1] == s2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    return dp[m][n]


def char_accuracy(predicted: str, ground_truth: str) -> float:
    """字符準確率（1 - 編輯距離 / max(長度)）"""
    if not ground_truth and not predicted:
        return 1.0
    if not ground_truth or not predicted:
        return 0.0
    dist = edit_distance(predicted, ground_truth)
    max_len = max(len(predicted), len(ground_truth))
    return max(0.0, 1.0 - dist / max_len)


def f1_score(predicted: set, ground_truth: set) -> Dict[str, float]:
    """計算 Precision, Recall, F1"""
    if not predicted and not ground_truth:
        return {"precision": 1.0, "recall": 1.0, "f1": 1.0}
    if not predicted or not ground_truth:
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0}

    tp = len(predicted & ground_truth)
    precision = tp / len(predicted) if predicted else 0.0
    recall = tp / len(ground_truth) if ground_truth else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    return {"precision": round(precision, 3), "recall": round(recall, 3), "f1": round(f1, 3)}


def extract_object_ids(fig: dict) -> set:
    """提取所有 object id"""
    return {o.get("id", "") for o in fig.get("objects", []) if o.get("id")}


def extract_object_types(fig: dict) -> Dict[str, set]:
    """按 type 分組提取 object id"""
    groups: Dict[str, set] = {}
    for o in fig.get("objects", []):
        t = o.get("type", "unknown")
        groups.setdefault(t, set()).add(o.get("id", o.get("label", "")))
    return groups


def extract_relationship_keys(fig: dict) -> set:
    """提取關係的標準化 key（type + entities）"""
    keys = set()
    for r in fig.get("relationships", []):
        t = r.get("type", "")
        entities = tuple(sorted(r.get("entities", [])))
        subject = r.get("subject", "")
        target = r.get("of", r.get("target", ""))
        points = tuple(sorted(r.get("points", [])))

        if entities:
            keys.add(f"{t}:{','.join(entities)}")
        elif subject:
            keys.add(f"{t}:{subject}->{target}")
        elif points:
            keys.add(f"{t}:{','.join(points)}")
    return keys


def extract_measurement_keys(fig: dict) -> set:
    """提取量測的標準化 key"""
    keys = set()
    for m in fig.get("measurements", []):
        target = m.get("target", m.get("what", ""))
        prop = m.get("property", "")
        value = str(m.get("value", ""))
        keys.add(f"{target}.{prop}={value}")
    return keys


def evaluate_readable_quality(readable: str, ground_truth_fig: dict) -> Dict[str, bool]:
    """
    評估 readable_description 質量

    檢查：
    - 是否包含關鍵對象 label
    - 是否包含關鍵量測值
    - 是否包含關鍵關係描述
    - 是否正確區分 inferred
    """
    results = {
        "has_key_objects": False,
        "has_key_measurements": False,
        "has_key_relationships": False,
        "inferred_correctly_marked": True,  # 默認 True，有問題才 False
    }

    if not readable:
        return results

    # 檢查關鍵對象
    objects = ground_truth_fig.get("objects", [])
    key_labels = [o.get("label", "") for o in objects if o.get("label")]
    if key_labels:
        found = sum(1 for l in key_labels if l in readable)
        results["has_key_objects"] = found >= len(key_labels) * 0.5

    # 檢查量測值
    measurements = ground_truth_fig.get("measurements", [])
    key_values = [str(m.get("value", "")) for m in measurements if m.get("value")]
    if key_values:
        found = sum(1 for v in key_values if v in readable)
        results["has_key_measurements"] = found >= len(key_values) * 0.5

    # 檢查關係
    rels = ground_truth_fig.get("relationships", [])
    if rels:
        # 簡單檢查：至少一個關係類型詞出現
        rel_keywords = {"//", "⊥", "中點", "共線", "≅", "∼", "平分", "切"}
        results["has_key_relationships"] = any(kw in readable for kw in rel_keywords)

    # 檢查 inferred 標記
    inferred_rels = [r for r in rels if r.get("source") == "inferred"]
    if inferred_rels and "?" not in readable:
        results["inferred_correctly_marked"] = False

    return results


def evaluate_case(case: dict, prediction: Optional[dict] = None) -> Dict[str, Any]:
    """
    評估單個 case

    Args:
        case: 標註數據 (含 ground_truth)
        prediction: 模型預測結果 (如果為 None，跳過)
    """
    gt = case.get("ground_truth", {})
    result = {
        "case_id": case.get("case_id", "unknown"),
        "image": case.get("image", ""),
        "metrics": {},
    }

    if not prediction:
        result["skipped"] = True
        return result

    # 1. 題幹 OCR 準確率
    result["metrics"]["question_accuracy"] = char_accuracy(
        prediction.get("question_text", ""),
        gt.get("question_text", ""),
    )

    # 2. 答案 OCR 準確率
    result["metrics"]["answer_accuracy"] = char_accuracy(
        prediction.get("answer_text", ""),
        gt.get("answer_text", ""),
    )

    # 3. 圖形存在檢測
    pred_has_fig = prediction.get("has_figure", False)
    gt_has_fig = gt.get("has_figure", False)
    result["metrics"]["figure_detection_correct"] = pred_has_fig == gt_has_fig

    if gt_has_fig and pred_has_fig:
        pred_fig = prediction
        gt_fig = gt

        # 4. 元素識別 F1（按 type 分組）
        pred_types = extract_object_types(pred_fig)
        gt_types = extract_object_types(gt_fig)
        all_types = set(list(pred_types.keys()) + list(gt_types.keys()))
        type_f1 = {}
        for t in all_types:
            type_f1[t] = f1_score(pred_types.get(t, set()), gt_types.get(t, set()))
        result["metrics"]["object_f1_by_type"] = type_f1

        # 5. 關係識別 F1
        pred_rels = extract_relationship_keys(pred_fig)
        gt_rels = extract_relationship_keys(gt_fig)
        result["metrics"]["relationship_f1"] = f1_score(pred_rels, gt_rels)

        # 6. 量測識別準確率
        pred_meas = extract_measurement_keys(pred_fig)
        gt_meas = extract_measurement_keys(gt_fig)
        result["metrics"]["measurement_f1"] = f1_score(pred_meas, gt_meas)

    # 7. readable_description_quality
    readable = prediction.get("readable_description", "")
    if readable and gt_has_fig:
        result["metrics"]["readable_quality"] = evaluate_readable_quality(readable, gt)

    return result


def aggregate_results(results: List[Dict]) -> Dict:
    """聚合所有 case 的評測結果"""
    total = len(results)
    valid = [r for r in results if not r.get("skipped")]

    if not valid:
        return {"total_cases": total, "evaluated": 0, "message": "No predictions available"}

    agg = {
        "total_cases": total,
        "evaluated": len(valid),
        "avg_question_accuracy": 0.0,
        "avg_answer_accuracy": 0.0,
        "figure_detection_accuracy": 0.0,
        "avg_relationship_f1": 0.0,
        "avg_measurement_f1": 0.0,
        "readable_quality_summary": {},
        "failed_cases": [],
    }

    q_accs = [r["metrics"]["question_accuracy"] for r in valid]
    a_accs = [r["metrics"]["answer_accuracy"] for r in valid]
    fig_correct = [r["metrics"].get("figure_detection_correct", False) for r in valid]

    agg["avg_question_accuracy"] = round(sum(q_accs) / len(q_accs), 3)
    agg["avg_answer_accuracy"] = round(sum(a_accs) / len(a_accs), 3)
    agg["figure_detection_accuracy"] = round(sum(fig_correct) / len(fig_correct), 3)

    # 關係 F1
    rel_f1s = [r["metrics"]["relationship_f1"]["f1"]
               for r in valid if "relationship_f1" in r["metrics"]]
    if rel_f1s:
        agg["avg_relationship_f1"] = round(sum(rel_f1s) / len(rel_f1s), 3)

    # 量測 F1
    meas_f1s = [r["metrics"]["measurement_f1"]["f1"]
                for r in valid if "measurement_f1" in r["metrics"]]
    if meas_f1s:
        agg["avg_measurement_f1"] = round(sum(meas_f1s) / len(meas_f1s), 3)

    # readable quality
    rq_all = [r["metrics"]["readable_quality"]
              for r in valid if "readable_quality" in r["metrics"]]
    if rq_all:
        agg["readable_quality_summary"] = {
            "has_key_objects": round(sum(1 for r in rq_all if r["has_key_objects"]) / len(rq_all), 3),
            "has_key_measurements": round(sum(1 for r in rq_all if r["has_key_measurements"]) / len(rq_all), 3),
            "has_key_relationships": round(sum(1 for r in rq_all if r["has_key_relationships"]) / len(rq_all), 3),
            "inferred_correctly_marked": round(sum(1 for r in rq_all if r["inferred_correctly_marked"]) / len(rq_all), 3),
        }

    # 失敗 case（question_accuracy < 0.5 或 figure_detection 錯誤）
    for r in valid:
        m = r["metrics"]
        if m["question_accuracy"] < 0.5 or not m.get("figure_detection_correct", True):
            agg["failed_cases"].append(r["case_id"])

    return agg


def run_evaluation(fixtures_dir: str, output_dir: str):
    """主評測流程"""
    case_files = sorted(glob.glob(os.path.join(fixtures_dir, "case_*.json")))

    if not case_files:
        print(f"⚠ 未找到測試用例（{fixtures_dir}/case_*.json）")
        print("  請先積累測試樣本到 fixtures/ 目錄")
        return

    print(f"找到 {len(case_files)} 個測試用例")

    results = []
    for f in case_files:
        with open(f, "r", encoding="utf-8") as fp:
            case = json.load(fp)

        # 查找對應的預測結果
        pred_file = os.path.join(output_dir, f"pred_{case.get('case_id', '')}.json")
        prediction = None
        if os.path.exists(pred_file):
            with open(pred_file, "r", encoding="utf-8") as fp:
                prediction = json.load(fp)

        result = evaluate_case(case, prediction)
        results.append(result)

    # 聚合
    summary = aggregate_results(results)

    # 輸出
    output_file = os.path.join(output_dir, f"eval_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    os.makedirs(output_dir, exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as fp:
        json.dump({"summary": summary, "details": results}, fp, ensure_ascii=False, indent=2)

    # 打印摘要
    print("\n" + "=" * 60)
    print("  幾何識別評測報告")
    print("=" * 60)
    print(f"  總用例數：{summary['total_cases']}")
    print(f"  已評測：{summary['evaluated']}")
    if summary["evaluated"] > 0:
        print(f"  題幹 OCR 準確率：{summary['avg_question_accuracy']:.1%}")
        print(f"  答案 OCR 準確率：{summary['avg_answer_accuracy']:.1%}")
        print(f"  圖形檢測準確率：{summary['figure_detection_accuracy']:.1%}")
        print(f"  關係識別 F1：{summary['avg_relationship_f1']:.1%}")
        print(f"  量測識別 F1：{summary['avg_measurement_f1']:.1%}")
        if summary["readable_quality_summary"]:
            rq = summary["readable_quality_summary"]
            print(f"  Readable 含關鍵對象：{rq['has_key_objects']:.1%}")
            print(f"  Readable 含關鍵量測：{rq['has_key_measurements']:.1%}")
            print(f"  Readable 含關鍵關係：{rq['has_key_relationships']:.1%}")
            print(f"  Readable inferred 標記：{rq['inferred_correctly_marked']:.1%}")
        if summary["failed_cases"]:
            print(f"\n  ❌ 失敗用例：{', '.join(summary['failed_cases'])}")
    print("=" * 60)
    print(f"  詳細報告已寫入：{output_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="幾何識別評測")
    parser.add_argument("--fixtures-dir", default="tests/geometry_benchmark/fixtures")
    parser.add_argument("--output", default="tests/geometry_benchmark/results")
    args = parser.parse_args()

    run_evaluation(args.fixtures_dir, args.output)
