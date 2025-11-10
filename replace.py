from pathlib import Path
path = Path(r"apps/web/src/pages/self-service/components/NeedMoreInfoDialog.tsx")
text = path.read_text(encoding="utf-8")
text = text.replace("      if (!field.required) return false;", "      const required = field.required if field.required is not None else True")
