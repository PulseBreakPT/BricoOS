import unittest

from caixilharia_logic import caixilharia_email_lines, caixilharia_summary, normalize_caixilharia_spec


PRODUCTS = {"janela": "Janela", "porta": "Porta", "rede_mosquiteira": "Rede mosquiteira"}
FAMILIES = {
    "pvc": {"label": "PVC", "sistemas": {"eurodesign70_batente": "Eurodesign 70 Batente"}},
    "aluminio_corte_termico": {
        "label": "Alumínio com corte térmico",
        "sistemas": {"thermostop_batente": "Thermostop Batente"},
    },
}


class CaixilhariaLogicTests(unittest.TestCase):
    def test_mixed_door_and_window_keep_independent_measurements(self):
        spec = normalize_caixilharia_spec({
            "linhas": [
                {"produto": "porta", "quantidade": 1, "largura_mm": 800, "altura_mm": 2000,
                 "opcoes": [{"familia": "pvc", "sistema": "eurodesign70_batente"}]},
                {"produto": "janela", "quantidade": 1, "largura_mm": 1000, "altura_mm": 1000,
                 "opcoes": [{"familia": "aluminio_corte_termico", "sistema": "thermostop_batente"}]},
            ],
        })
        self.assertEqual(len(spec["linhas"]), 2)
        self.assertEqual((spec["linhas"][0]["largura_mm"], spec["linhas"][0]["altura_mm"]), (800, 2000))
        self.assertEqual((spec["linhas"][1]["largura_mm"], spec["linhas"][1]["altura_mm"]), (1000, 1000))

    def test_one_opening_can_compare_pvc_and_aluminium(self):
        raw = {"linhas": [{
            "produto": "janela", "quantidade": 1, "largura_mm": 1000, "altura_mm": 1000,
            "opcoes": [
                {"familia": "pvc", "sistema": "eurodesign70_batente"},
                {"familia": "aluminio_corte_termico", "sistema": "thermostop_batente"},
            ],
        }]}
        summary = caixilharia_summary(raw, PRODUCTS, FAMILIES)
        self.assertEqual(summary["element_count"], 1)
        self.assertEqual(summary["option_count"], 2)
        self.assertEqual(summary["comparison_count"], 1)
        self.assertIn("PVC", summary["familia"])
        self.assertIn("Alumínio", summary["familia"])

        lines, _ = caixilharia_email_lines(raw, PRODUCTS, FAMILIES, warning="Vãos vistos por dentro")
        body = "\n".join(lines)
        self.assertIn("1. Janela — 1 un — 1000 x 1000 mm (L x A)", body)
        self.assertIn("Opção A: PVC — Eurodesign 70 Batente", body)
        self.assertIn("Opção B: Alumínio com corte térmico — Thermostop Batente", body)
        self.assertIn("valores separados por opção", body)

    def test_mixed_elements_are_rendered_as_separate_email_lines(self):
        raw = {"linhas": [
            {"produto": "porta", "quantidade": 1, "largura_mm": 800, "altura_mm": 2000,
             "opcoes": [{"familia": "pvc", "sistema": "eurodesign70_batente"}]},
            {"produto": "janela", "quantidade": 1, "largura_mm": 1000, "altura_mm": 1000,
             "opcoes": [{"familia": "aluminio_corte_termico", "sistema": "thermostop_batente"}]},
        ]}
        lines, display = caixilharia_email_lines(raw, PRODUCTS, FAMILIES)
        body = "\n".join(lines)
        self.assertIn("1. Porta — 1 un — 800 x 2000 mm", body)
        self.assertIn("2. Janela — 1 un — 1000 x 1000 mm", body)
        self.assertEqual(display["element_count"], 2)

    def test_legacy_items_migrate_to_independent_elements(self):
        spec = normalize_caixilharia_spec({
            "produto": "janela", "familia": "pvc", "sistema": "eurodesign70_batente",
            "itens": [
                {"quantidade": 1, "largura_mm": 1000, "altura_mm": 1200},
                {"quantidade": 2, "largura_mm": 800, "altura_mm": 900},
            ],
        })
        self.assertEqual(spec["schema_version"], 2)
        self.assertEqual(len(spec["linhas"]), 2)
        self.assertTrue(all(line["opcoes"][0]["familia"] == "pvc" for line in spec["linhas"]))


if __name__ == "__main__":
    unittest.main()
