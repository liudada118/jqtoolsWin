import json
import sys
import unittest
from pathlib import Path

import numpy as np


REPO_ROOT = Path(__file__).resolve().parents[1]
PYTHON_APP_ROOT = REPO_ROOT / "python" / "app"
sys.path.insert(0, str(PYTHON_APP_ROOT))

from server import to_json_compatible  # noqa: E402


class JsonCompatibilityTests(unittest.TestCase):
    """验证算法结果中的 NumPy 类型可以稳定通过 JSON RPC 输出。"""

    def test_nested_numpy_values_are_converted(self):
        """递归转换布尔值、整数、浮点数、数组和元组。"""
        result = to_json_compatible({
            "enabled": np.bool_(True),
            "count": np.int64(3),
            "confidence": np.float32(0.5),
            "values": np.array([1, 2, 3], dtype=np.uint8),
            "nested": (np.bool_(False), np.int32(4)),
        })

        encoded = json.dumps(result)
        decoded = json.loads(encoded)

        self.assertIs(decoded["enabled"], True)
        self.assertEqual(decoded["count"], 3)
        self.assertAlmostEqual(decoded["confidence"], 0.5)
        self.assertEqual(decoded["values"], [1, 2, 3])
        self.assertEqual(decoded["nested"], [False, 4])


if __name__ == "__main__":
    unittest.main()
