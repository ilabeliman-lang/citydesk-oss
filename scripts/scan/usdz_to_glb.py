"""NDU-UPG #351: USDZ -> GLB on the CPU (usd-core, TOST-1.0 licence + usd2gltf, MIT).

Usage: python usdz_to_glb.py <in.usdz> <out.glb>
Prints one JSON line: {"ok": true, "upAxis": "Y"|"Z", "metersPerUnit": float, "meshes": n}
usd2gltf copies USD coordinates as-is, so the up axis and units are reported back and the
Node pipeline (pipeline.mjs) turns the result into Y-up metres.
"""
import contextlib
import json
import sys


def main():
    src, out = sys.argv[1], sys.argv[2]
    from pxr import UsdGeom
    from usd2gltf.converter import Converter

    conv = Converter()
    with contextlib.redirect_stdout(sys.stderr):
        stage = conv.load_usd(src)
    if stage is None:
        print(json.dumps({"ok": False, "reason": "Could not open the USD scene."}))
        return 2
    up = UsdGeom.GetStageUpAxis(stage)
    mpu = UsdGeom.GetStageMetersPerUnit(stage)
    meshes = sum(1 for p in stage.Traverse() if p.IsA(UsdGeom.Mesh))
    if meshes == 0:
        print(json.dumps({"ok": False, "reason": "This USDZ has no meshes to draw."}))
        return 2
    with contextlib.redirect_stdout(sys.stderr):
        conv.process(stage, out)
    print(json.dumps({"ok": True, "upAxis": str(up), "metersPerUnit": float(mpu), "meshes": meshes}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as err:  # conversion bugs are reported, not crashed through
        print(json.dumps({"ok": False, "reason": f"USDZ conversion failed: {type(err).__name__}", "detail": str(err)[:300]}))
        sys.exit(1)
