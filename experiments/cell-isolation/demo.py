#!/usr/bin/env python3
"""Cell-based architecture: blast radius comparison."""

def simulate_cell_blast_radius(total_users: int = 10000, num_cells: int = 10, failure_cells: int = 1):
    """Compare blast radius with/without cell isolation."""
    no_isolation_affected = total_users
    with_isolation_affected = (total_users // num_cells) * failure_cells

    no_isolation_pct = no_isolation_affected / total_users
    with_isolation_pct = with_isolation_affected / total_users

    print(f"=== Cell-Based Architecture Blast Radius ===")
    print(f"Total users: {total_users}")
    print(f"Cells: {num_cells}")
    print(f"Failed cells: {failure_cells}")
    print()
    print(f"No isolation:    {no_isolation_affected:>6} users affected ({no_isolation_pct:.0%})")
    print(f"Cell isolation:  {with_isolation_affected:>6} users affected ({with_isolation_pct:.0%})")
    print(f"Reduction:       {(1 - with_isolation_pct/no_isolation_pct):.0%}")

    # Verify assertions
    assert no_isolation_pct == 1.0, f"Expected 100% no isolation, got {no_isolation_pct:.0%}"
    assert with_isolation_pct == 0.1, f"Expected 10% cell isolation, got {with_isolation_pct:.0%}"
    print()
    print("✓ Assertions passed: 100% vs 10% blast radius")

    # Different cell counts
    print()
    print("=== Blast Radius by Cell Count ===")
    for n in [5, 10, 20, 50, 100]:
        pct = 1 / n
        print(f"  {n:>3} cells: {pct:.1%} blast radius per cell failure")


if __name__ == "__main__":
    simulate_cell_blast_radius()
