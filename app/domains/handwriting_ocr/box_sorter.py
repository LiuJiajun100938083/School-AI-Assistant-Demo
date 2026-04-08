"""Pure-function utilities for ordering text bounding boxes.

Single responsibility: take a list of detected boxes and return them in
natural reading order (top-to-bottom, left-to-right within each line).

No IO, no model dependencies — purely list/tuple math, easy to unit test.
"""

from __future__ import annotations

from typing import List, Sequence, Tuple

# A box is a 4-tuple (x_min, y_min, x_max, y_max) in pixel coordinates,
# all floats. We accept any iterable of 4 numbers and normalize internally.
Box = Tuple[float, float, float, float]


def normalize_box(raw) -> Box:
    """Coerce a raw box (list/tuple/np.ndarray) into a 4-float tuple."""
    return (float(raw[0]), float(raw[1]), float(raw[2]), float(raw[3]))


def order_text_boxes(
    boxes: Sequence,
    line_overlap_threshold: float = 0.5,
) -> List[Box]:
    """Sort boxes into natural reading order.

    Algorithm:
      1. Normalize boxes to (xmin, ymin, xmax, ymax) tuples.
      2. Sort by ymin so we walk top-to-bottom.
      3. Group boxes into "lines" based on vertical overlap with the
         current line's average y-range.
      4. Within each line, sort left-to-right by xmin.
      5. Concatenate lines top-to-bottom.

    Args:
        boxes: iterable of 4-element box-like objects
        line_overlap_threshold: ratio (0..1) of vertical overlap with the
            line's running average y-range required to consider the new
            box "on the same line". Default 0.5.

    Returns:
        List of normalized boxes in reading order.
    """
    normalized = [normalize_box(b) for b in boxes]
    if not normalized:
        return []

    # Sort by ymin first so we process top-down
    normalized.sort(key=lambda b: b[1])

    lines: List[List[Box]] = []
    line_ranges: List[Tuple[float, float]] = []  # (mean_ymin, mean_ymax) per line

    for box in normalized:
        ymin, ymax = box[1], box[3]
        height = max(ymax - ymin, 1.0)
        placed = False
        for i, (lmin, lmax) in enumerate(line_ranges):
            overlap = max(0.0, min(ymax, lmax) - max(ymin, lmin))
            if overlap / height >= line_overlap_threshold:
                lines[i].append(box)
                # Update running mean range
                n = len(lines[i])
                line_ranges[i] = (
                    ((lmin * (n - 1)) + ymin) / n,
                    ((lmax * (n - 1)) + ymax) / n,
                )
                placed = True
                break
        if not placed:
            lines.append([box])
            line_ranges.append((ymin, ymax))

    # Sort each line left-to-right
    for line in lines:
        line.sort(key=lambda b: b[0])

    # Flatten top-to-bottom
    result: List[Box] = []
    for line in lines:
        result.extend(line)
    return result


def group_boxes_by_line(
    boxes: Sequence,
    line_overlap_threshold: float = 0.5,
) -> List[List[Box]]:
    """Same as order_text_boxes but returns boxes grouped per line.

    Useful when you want to recognize each line separately and join the
    results with newlines.
    """
    normalized = [normalize_box(b) for b in boxes]
    if not normalized:
        return []
    normalized.sort(key=lambda b: b[1])

    lines: List[List[Box]] = []
    line_ranges: List[Tuple[float, float]] = []

    for box in normalized:
        ymin, ymax = box[1], box[3]
        height = max(ymax - ymin, 1.0)
        placed = False
        for i, (lmin, lmax) in enumerate(line_ranges):
            overlap = max(0.0, min(ymax, lmax) - max(ymin, lmin))
            if overlap / height >= line_overlap_threshold:
                lines[i].append(box)
                n = len(lines[i])
                line_ranges[i] = (
                    ((lmin * (n - 1)) + ymin) / n,
                    ((lmax * (n - 1)) + ymax) / n,
                )
                placed = True
                break
        if not placed:
            lines.append([box])
            line_ranges.append((ymin, ymax))

    for line in lines:
        line.sort(key=lambda b: b[0])
    return lines
