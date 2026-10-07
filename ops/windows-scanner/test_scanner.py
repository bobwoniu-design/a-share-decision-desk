import unittest
from datetime import datetime
from unittest.mock import patch

import scanner


CONFIG = {"url": "https://example.com", "token": "private-test-token"}
SESSION = datetime(2026, 10, 8, 9, 31, tzinfo=scanner.CHINA_TIME)


class ScannerTests(unittest.TestCase):
    def test_skips_off_hours_without_requesting_data(self):
        with patch.object(scanner, "post") as request:
            result = scanner.run(CONFIG, now=datetime(2026, 10, 8, 20, 0, tzinfo=scanner.CHINA_TIME))
        self.assertEqual(result["skipped"], "非盘中时段")
        request.assert_not_called()

    def test_scans_all_pool_targets_and_counts_delivery(self):
        targets = [
            {"code": "600418.SH", "name": "江淮汽车", "theme": "BK0001.DC", "held": False},
            {"code": "600825.SH", "name": "新华传媒", "theme": "", "held": True},
        ]

        def fake_post(_url, _token, body):
            if body["action"] == "pool":
                return {"targets": targets}
            return {"sent": body["target"]["held"], "skipped": None}

        with patch.object(scanner, "post", side_effect=fake_post) as request:
            result = scanner.run(CONFIG, now=SESSION)
        self.assertEqual(result["targets"], 2)
        self.assertEqual(result["sent"], 1)
        self.assertEqual(request.call_count, 3)

    def test_connection_check_never_scans_individual_stocks(self):
        with patch.object(scanner, "post", return_value={"skipped": "非连续竞价时段"}) as request:
            result = scanner.run(CONFIG, check_only=True, now=SESSION)
        self.assertEqual(result["connection"], "ok")
        self.assertEqual(request.call_count, 1)

    def test_bark_test_uses_the_same_authenticated_site_endpoint(self):
        with patch.object(scanner, "post", return_value={"delivered": True}) as request:
            result = scanner.send_test_alert(CONFIG)
        self.assertEqual(result, {"test": "bark", "delivered": True})
        request.assert_called_once_with(CONFIG["url"], CONFIG["token"], {"action": "test"})


if __name__ == "__main__":
    unittest.main()
