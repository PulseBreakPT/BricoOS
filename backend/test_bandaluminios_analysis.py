import unittest

try:
    from bandaluminios_analysis import MISSING, build_catalog_analysis, is_official_source
    from bandaluminios_catalog import MODELS
except ImportError:
    from .bandaluminios_analysis import MISSING, build_catalog_analysis, is_official_source
    from .bandaluminios_catalog import MODELS


class BandAluminiosAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.analysis = build_catalog_analysis(MODELS)
        self.models = self.analysis["model_index"]

    def test_class_four_air_is_transparently_normalised_to_100(self):
        feature = self.models["thermostop24_batente"]["features"]["air"]
        self.assertEqual(feature["score"], 100.0)
        self.assertEqual(feature["standard"], "EN 12207:2016")
        self.assertIn("4 ÷ 4", feature["formula"])
        self.assertTrue(all(source.get("url") for source in feature["sources"]))

    def test_confort_invalid_air_class_is_not_scored(self):
        feature = self.models["confort_correr"]["features"]["air"]
        self.assertEqual(feature["status"], "conflict")
        self.assertIsNone(feature["score"])
        self.assertIn("Classe 34", feature["value"])

    def test_legacy_din_class_is_traced_but_never_converted(self):
        feature = self.models["eurodesign70_batente"]["features"]["air"]
        self.assertEqual(feature["status"], "legacy_unmapped")
        self.assertIsNone(feature["score"])
        self.assertIn("DIN 18055", feature["standard"])

    def test_only_models_with_common_core_evidence_enter_ranking(self):
        self.assertEqual(self.analysis["ranking"][0], "thermostop24_batente")
        self.assertEqual(len(self.analysis["ranking"]), 3)
        self.assertIsNone(self.models["sb_batente"]["overall"]["score"])
        self.assertEqual(self.models["sb_batente"]["overall"]["explanation"], MISSING)

    def test_ranking_has_categories_percentiles_and_medals(self):
        winner = self.models["thermostop24_batente"]["overall"]
        self.assertEqual(winner["category"], "SS")
        self.assertEqual(winner["rank"], 1)
        self.assertEqual(winner["percentile"], 100.0)
        self.assertEqual(winner["medal"], "Ouro")

    def test_price_quality_stays_missing_without_official_prices(self):
        winner = self.analysis["winners"]["quality_price"]
        self.assertEqual(winner["status"], "missing")
        self.assertEqual(winner["value"], MISSING)

    def test_all_scored_features_are_auditable(self):
        for model in self.analysis["models"]:
            for feature in model["features"].values():
                if feature["score"] is None:
                    continue
                self.assertTrue(feature["formula"], f"Sem fórmula: {model['id']} / {feature['key']}")
                self.assertTrue(feature["standard"], f"Sem norma: {model['id']} / {feature['key']}")
                self.assertGreaterEqual(len(feature["sources"]), 2)
                self.assertTrue(all(is_official_source(source["url"]) for source in feature["sources"]))

    def test_future_model_is_visible_but_blocked_without_evidence(self):
        models = dict(MODELS)
        models["future_reference"] = {
            "name": "Referência futura",
            "material": "Alumínio",
            "category": "correr",
            "category_label": "Série de correr",
            "description": "Nova referência ainda sem documentação verificada.",
            "characteristics": {},
        }
        analysis = build_catalog_analysis(models)
        future = analysis["model_index"]["future_reference"]
        self.assertIsNone(future["overall"]["score"])
        self.assertEqual(future["features"]["air"]["value"], MISSING)
        self.assertIn("future_reference", {item["model_id"] for item in analysis["research_queue"]})


if __name__ == "__main__":
    unittest.main()
