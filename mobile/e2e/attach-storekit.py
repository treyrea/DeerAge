"""Point the DeerAge iOS scheme at the local StoreKit catalog. No signing changes."""
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parents[1]
schemes = list((root / "ios").glob("*.xcodeproj/xcshareddata/xcschemes/*.xcscheme"))
if not schemes:
    sys.exit("no xcscheme after prebuild")
scheme = schemes[0]
text = scheme.read_text()
if "StoreKitConfigurationFileReference" in text:
    print("storekit already attached", scheme)
    raise SystemExit(0)
match = re.search(r"<LaunchAction\b[^>]*>", text)
if not match:
    sys.exit("LaunchAction missing")
child = """
      <StoreKitConfigurationFileReference
         identifier = "../e2e/DeerAge.storekit">
      </StoreKitConfigurationFileReference>"""
text = text[:match.end()] + child + text[match.end():]
scheme.write_text(text)
print("attached", scheme)
