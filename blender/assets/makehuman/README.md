# MakeHuman base data (CC0)

These files come from the MakeHuman project
(https://github.com/makehumancommunity/makehuman, `makehuman/data/`), whose
bundled assets (base mesh, morph targets, skeleton and skin weights) are
released under **CC0 1.0 Universal**. They are stored gzipped and unchanged:

- `base.obj.gz`: the hm08 base mesh (decimetre units, Y up, facing +Z)
- `default.mhskel.gz`: joint definitions (each joint is the mean of a set of vertices)
- `default_weights.mhw.gz`: skin weights for the default skeleton
- `macrodetails__*.target.gz`: macro morph targets (gender / age / muscle /
  weight / height / proportions); `__` stands for `/` in the original path

`blender/human.py` shapes the body from them and `blender/characters.py`
builds the clothed, rigged soldiers on top. The clothing, gear and textures
are made by those scripts, not taken from MakeHuman.
