using System;
using System.IO;
using System.Linq;
using Microsoft.AnalysisServices.Tabular;

// TomTool: validates a TMSL model.bim with Microsoft's Tabular Object Model and converts it to TMDL.
//   TomTool bim2tmdl <model.bim> <out-definition-folder> [normalised.bim]
class Program
{
    static int Main(string[] args)
    {
        if (args.Length < 3 || args[0] != "bim2tmdl")
        {
            Console.Error.WriteLine("usage: TomTool bim2tmdl <model.bim> <out-folder> [normalised.bim]");
            return 2;
        }
        var json = File.ReadAllText(args[1]);
        Database db = JsonSerializer.DeserializeDatabase(json, new DeserializeOptions(), Microsoft.AnalysisServices.CompatibilityMode.PowerBI);   // throws on unresolved references
        var m = db.Model;
        Console.WriteLine($"compatibilityLevel={db.CompatibilityLevel} mode={db.CompatibilityMode} tables={m.Tables.Count} " +
                          $"columns={m.Tables.Sum(t => t.Columns.Count)} measures={m.Tables.Sum(t => t.Measures.Count)} " +
                          $"relationships={m.Relationships.Count} roles={m.Roles.Count} expressions={m.Expressions.Count}");
        foreach (var r in m.Relationships.OfType<SingleColumnRelationship>())
        {
            Console.WriteLine($"  rel {(r.IsActive ? "active  " : "inactive")} {r.FromColumn.Table.Name}[{r.FromColumn.Name}] *->1 " +
                              $"{r.ToColumn.Table.Name}[{r.ToColumn.Name}] cross={r.CrossFilteringBehavior}");
        }
        foreach (var t in m.Tables)
            foreach (var c in t.Columns.Where(c => c.SortByColumn != null))
                Console.WriteLine($"  sortBy {t.Name}[{c.Name}] -> [{c.SortByColumn.Name}]");
        foreach (var role in m.Roles)
            Console.WriteLine($"  role '{role.Name}' filters={role.TablePermissions.Count}");

        if (Directory.Exists(args[2])) Directory.Delete(args[2], true);
        TmdlSerializer.SerializeDatabaseToFolder(db, args[2]);
        var back = TmdlSerializer.DeserializeDatabaseFromFolder(args[2]);   // round trip proves the TMDL parses
        Console.WriteLine($"TMDL round-trip OK: tables={back.Model.Tables.Count} measures={back.Model.Tables.Sum(t => t.Measures.Count)} " +
                          $"relationships={back.Model.Relationships.Count}");
        if (args.Length > 3)
            File.WriteAllText(args[3], JsonSerializer.SerializeDatabase(db, new SerializeOptions { IgnoreTimestamps = true, IgnoreInferredObjects = true, IgnoreInferredProperties = true }));
        return 0;
    }
}
