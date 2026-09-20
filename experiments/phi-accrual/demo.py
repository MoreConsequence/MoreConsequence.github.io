#!/usr/bin/env python3
"""Phi-accrual failure detector simulation."""

import math
import random


def erf(x):
    """Error function approximation (Abramowitz and Stegun)."""
    sign = 1 if x >= 0 else -1
    x = abs(x)
    t = 1.0 / (1.0 + 0.3275911 * x)
    y = 1.0 - (
        ((((1.061405429 - t * (1.453152027 - t * 0.725581961)) * t) - 0.450606366) * t)
        + 0.142809879
    ) * t * math.exp(-x * x)
    return sign * y


def phi_accrual_detector(intervals, threshold=8):
    """Simulate phi-accrual failure detector.

    Returns: (triggered_index, phi_history)
    """
    mean = intervals[0]
    variance = 20.0 ** 2  # initial: std=20ms

    triggered_at = None
    phi_history = []

    for i, interval in enumerate(intervals):
        # phi = -log10(1 - CDF(interval))
        std = math.sqrt(max(variance, 1e-10))
        cdf = 0.5 * (1 + erf((interval - mean) / (std * math.sqrt(2))))
        survival = max(1 - cdf, 1e-15)  # avoid log(0)
        phi = -math.log10(survival)
        phi_history.append(phi)

        if phi >= threshold and triggered_at is None:
            triggered_at = i

        # EWMA update
        alpha = 0.1
        mean = alpha * interval + (1 - alpha) * mean
        variance = alpha * (interval - mean) ** 2 + (1 - alpha) * variance

    return triggered_at, phi_history


def fixed_timeout_detector(intervals, timeout_ms=300):
    """Fixed timeout: first interval exceeding timeout triggers."""
    false_positives = 0
    triggered_at = None

    for i, interval in enumerate(intervals):
        if interval > timeout_ms:
            if triggered_at is None:
                triggered_at = i
            # Count false positives during normal period (before fault injection)
            # We'll pass pre-fault intervals separately
            pass

    return triggered_at


def main():
    random.seed(42)

    # Scenario 1: Normal heartbeat + network partition
    normal_intervals = [random.gauss(100, 20) for _ in range(80)]
    faulty_intervals = [random.gauss(500, 100) for _ in range(20)]
    all_intervals = normal_intervals + faulty_intervals

    # Phi-accrual detection
    phi_triggered, phi_history = phi_accrual_detector(all_intervals, threshold=8)

    # Fixed timeout detection (300ms)
    fixed_triggered = fixed_timeout_detector(all_intervals, timeout_ms=300)

    # False positives for fixed timeout (intervals during normal period > 300ms)
    false_positives_fixed = sum(1 for x in normal_intervals if x > 300)

    print("=== Phi-Accrual vs Fixed Timeout ===")
    print(f"Normal intervals: ~100ms ± 20ms (80 samples)")
    print(f"Faulty intervals: ~500ms ± 100ms (20 samples)")
    print()
    print(f"Phi-accrual (threshold=8):")
    print(f"  Triggered at: heartbeat #{phi_triggered}")
    print(f"  Fault started at: heartbeat #80")
    print(f"  Detection delay: {phi_triggered - 80} heartbeats")
    print()
    print(f"Fixed timeout (300ms):")
    print(f"  Triggered at: heartbeat #{fixed_triggered}")
    print(f"  False positives during normal period: {false_positives_fixed}")

    # Verify assertions
    assert phi_triggered is not None, "Phi-accrual should have triggered"
    assert phi_triggered >= 80, f"Phi should trigger after fault injection (got {phi_triggered})"
    assert false_positives_fixed <= 3, f"Fixed timeout should have few false positives (got {false_positives_fixed})"
    print()
    print("✓ All assertions passed")

    # Scenario 2: Show phi progression
    print()
    print("=== Phi Progression (first 15 after fault injection) ===")
    print(f"{'Heartbeat':<12} {'Interval':<12} {'Phi':<12}")
    for i in range(80, min(95, len(all_intervals))):
        print(f"  #{i:<10} {all_intervals[i]:>6.1f}ms    {phi_history[i]:>6.2f}")


if __name__ == "__main__":
    main()
