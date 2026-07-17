import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from email_templates import (
    business_greeting,
    client_quote_template,
    supplier_quote_template,
)


LISBON = ZoneInfo("Europe/Lisbon")


class EmailTemplateTests(unittest.TestCase):
    def setUp(self):
        self.note = {
            "id": "a1b2c3d4-e5f6-7890",
            "created_at": "2026-07-16T09:30:00+00:00",
            "description": "Bancada de madeira",
            "reference": "ART-44",
            "measurements": "2000 x 600 x 30 mm",
            "quantity": "2 unidades",
            "color": "Carvalho",
        }

    def test_business_greeting_uses_lisbon_business_time(self):
        self.assertEqual(business_greeting(datetime(2026, 7, 16, 10, tzinfo=LISBON)), "Bom dia")
        self.assertEqual(business_greeting(datetime(2026, 7, 16, 15, tzinfo=LISBON)), "Boa tarde")

    def test_supplier_template_matches_working_style_and_plural(self):
        template = supplier_quote_template(
            self.note,
            now=datetime(2026, 7, 16, 10, tzinfo=LISBON),
        )
        self.assertIn("Bom dia Exmos. Senhores,", template["body"])
        self.assertIn("para os seguintes artigos:", template["body"])
        self.assertNotIn("Referência do pedido", template["body"])
        self.assertIn("Referência do artigo: ART-44", template["body"])
        self.assertIn("Preço;", template["body"])

    def test_reminder_omits_internal_reference(self):
        template = supplier_quote_template(self.note, is_reminder=True)
        self.assertTrue(template["subject"].startswith("Lembrete · Pedido de cotação"))
        self.assertNotIn("BCF-", template["subject"])
        self.assertIn("reforçar o pedido de cotação", template["body"])
        self.assertNotIn("BCF-", template["body"])

    def test_client_template_is_ready_for_an_attachment(self):
        template = client_quote_template(self.note)
        self.assertIn("Segue em anexo o orçamento solicitado", template["body"])
        self.assertIn("já inclui IVA", template["body"])
        self.assertNotIn("BCF-26-A1B2C3D4", template["subject"])


if __name__ == "__main__":
    unittest.main()
