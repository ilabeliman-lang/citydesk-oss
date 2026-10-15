"""Build a USDZ test fixture from the smoke-room.glb golden fixture (NDU-UPG #351/#357).

Usage: python make_usdz_fixture.py <in.glb> <out.usdz> [--zup-cm]
--zup-cm writes a Z-up stage in centimetres (metersPerUnit 0.01), like some DCC exports,
so the pipeline's axis/unit normalisation is exercised too. Needs usd-core + pygltflib.
"""
import os
import struct
import sys
import tempfile

from pxr import Gf, Sdf, Usd, UsdGeom, UsdShade, UsdUtils, Vt
from pygltflib import GLTF2

FMT = {5126: ("f", 4), 5123: ("H", 2), 5125: ("I", 4)}
WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def read(g, blob, index):
    acc = g.accessors[index]
    view = g.bufferViews[acc.bufferView]
    code, size = FMT[acc.componentType]
    n = WIDTH[acc.type]
    start = (view.byteOffset or 0) + (acc.byteOffset or 0)
    flat = struct.unpack_from("<" + code * (acc.count * n), blob, start)
    return [flat[i : i + n] for i in range(0, len(flat), n)] if n > 1 else list(flat)


def main():
    src, out = sys.argv[1], sys.argv[2]
    zup_cm = "--zup-cm" in sys.argv
    g = GLTF2().load(src)
    blob = g.binary_blob()
    work = tempfile.mkdtemp()
    layer = os.path.join(work, "room.usdc")
    stage = Usd.Stage.CreateNew(layer)
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z if zup_cm else UsdGeom.Tokens.y)
    UsdGeom.SetStageMetersPerUnit(stage, 0.01 if zup_cm else 1.0)
    root = UsdGeom.Xform.Define(stage, "/Room")
    stage.SetDefaultPrim(root.GetPrim())
    k = 100.0 if zup_cm else 1.0

    def conv(p):
        x, y, z = p
        return Gf.Vec3f(x * k, -z * k, y * k) if zup_cm else Gf.Vec3f(x, y, z)

    colours = [(0.8, 0.75, 0.68), (0.55, 0.2, 0.15), (0.3, 0.45, 0.6)]
    for i, prim in enumerate(g.meshes[0].primitives):
        pts = read(g, blob, prim.attributes.POSITION)
        idx = read(g, blob, prim.indices)
        mesh = UsdGeom.Mesh.Define(stage, f"/Room/part{i}")
        mesh.CreatePointsAttr(Vt.Vec3fArray([conv(p) for p in pts]))
        mesh.CreateFaceVertexCountsAttr(Vt.IntArray([3] * (len(idx) // 3)))
        mesh.CreateFaceVertexIndicesAttr(Vt.IntArray(idx))
        mesh.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
        mat = UsdShade.Material.Define(stage, f"/Room/Looks/mat{i}")
        sh = UsdShade.Shader.Define(stage, f"/Room/Looks/mat{i}/PBR")
        sh.CreateIdAttr("UsdPreviewSurface")
        sh.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(*colours[i % 3]))
        sh.CreateInput("roughness", Sdf.ValueTypeNames.Float).Set(0.8)
        mat.CreateSurfaceOutput().ConnectToSource(sh.ConnectableAPI(), "surface")
        UsdShade.MaterialBindingAPI.Apply(mesh.GetPrim()).Bind(mat)
    stage.GetRootLayer().Save()
    if not UsdUtils.CreateNewUsdzPackage(Sdf.AssetPath(layer), out):
        sys.exit("usdz packaging failed")
    print(out)


if __name__ == "__main__":
    main()
