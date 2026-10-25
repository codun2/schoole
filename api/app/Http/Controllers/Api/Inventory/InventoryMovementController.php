<?php

namespace App\Http\Controllers\Api\Inventory;

use App\Http\Controllers\Controller;
use App\Models\InventoryItem;
use App\Models\InventoryMovement;
use App\Support\Activity;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Stock movements — the only way an item's quantity changes after creation.
 *   in       +qty (receipt / purchase)            → to_location
 *   out      −qty (issued to a class/department)  → from_location
 *   transfer  qty unchanged, item moves location  → from → to
 *   adjust   ±qty (stock-take correction; may be negative)
 *   dispose  −qty (damaged / written off)
 */
class InventoryMovementController extends Controller
{
    private const WITH = ['item:id,name,unit,type', 'fromLocation:id,name', 'toLocation:id,name', 'creator:id,name'];

    public function index(Request $request)
    {
        $q = InventoryMovement::with(self::WITH)->orderByDesc('date')->orderByDesc('id');
        if ($request->item_id) {
            $q->where('item_id', (int) $request->item_id);
        }
        if ($request->type) {
            $q->where('type', $request->type);
        }
        if ($request->from) {
            $q->whereDate('date', '>=', $request->from);
        }
        if ($request->to) {
            $q->whereDate('date', '<=', $request->to);
        }
        if ($request->boolean('all')) {
            $rows = $q->limit(5000)->get();

            return response()->json(['data' => $rows, 'total' => $rows->count()]);
        }

        return response()->json($q->paginate(min((int) ($request->per_page ?: 25), 200)));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'item_id'          => ['required', 'integer', $this->owned('inventory_items')],
            'type'             => ['required', 'in:'.implode(',', InventoryMovement::TYPES)],
            'quantity'         => ['required', 'numeric'],
            'from_location_id' => ['nullable', 'integer', $this->owned('inventory_locations')],
            'to_location_id'   => ['nullable', 'integer', $this->owned('inventory_locations')],
            'date'             => ['nullable', 'date'],
            'reason'           => ['nullable', 'string', 'max:255'],
        ]);
        $qty = (float) $data['quantity'];
        if ($data['type'] !== 'adjust' && $qty <= 0) {
            throw ValidationException::withMessages(['quantity' => ['الكمية يجب أن تكون أكبر من صفر.']]);
        }
        if ($data['type'] === 'transfer' && empty($data['to_location_id'])) {
            throw ValidationException::withMessages(['to_location_id' => ['حدّد الموقع المنقول إليه.']]);
        }

        $item = InventoryItem::findOrFail($data['item_id']);
        $movement = DB::transaction(function () use ($item, $data, $qty, $request) {
            $fromLoc = $item->location_id;
            $delta = match ($data['type']) {
                'in'      => $qty,
                'out', 'dispose' => -$qty,
                'adjust'  => $qty,
                'transfer' => 0.0,
            };
            $new = (float) $item->quantity + $delta;
            if ($new < -0.00001) {
                throw ValidationException::withMessages(['quantity' => ['الكمية المطلوبة ('.number_format($qty, 2).') أكبر من المتوفر ('.number_format((float) $item->quantity, 2).').']]);
            }
            $item->quantity = max(0, $new);
            if ($data['type'] === 'transfer') {
                $item->location_id = $data['to_location_id'];
            }
            if ($data['type'] === 'dispose' && $item->type === 'asset' && (float) $item->quantity <= 0) {
                $item->condition = 'damaged';
            }
            $item->save();

            return InventoryMovement::create([
                'item_id'          => $item->id,
                'type'             => $data['type'],
                'quantity'         => $qty,
                'from_location_id' => $data['from_location_id'] ?? ($data['type'] === 'in' ? null : $fromLoc),
                'to_location_id'   => $data['to_location_id'] ?? ($data['type'] === 'in' ? $item->location_id : null),
                'date'             => $data['date'] ?? now()->toDateString(),
                'reason'           => $data['reason'] ?? null,
                'created_by'       => $request->user()->id,
            ]);
        });
        Activity::log('create', $movement, 'حركة مخزن ('.$data['type'].'): '.$item->name);

        return response()->json([
            'id'       => $movement->id,
            'movement' => $movement->load(self::WITH),
            'item'     => $item->fresh(['category:id,name', 'location:id,name']),
        ], 201);
    }

    /** Undo a movement (entered by mistake): reverse its effect on the item, then delete it. */
    public function destroy(Request $request, $id)
    {
        $m = InventoryMovement::findOrFail($id);
        $item = InventoryItem::findOrFail($m->item_id);
        DB::transaction(function () use ($m, $item) {
            $qty = (float) $m->quantity;
            $delta = match ($m->type) {
                'in'      => -$qty,
                'out', 'dispose' => $qty,
                'adjust'  => -$qty,
                'transfer' => 0.0,
            };
            $item->quantity = max(0, (float) $item->quantity + $delta);
            if ($m->type === 'transfer' && $m->from_location_id) {
                $item->location_id = $m->from_location_id;
            }
            $item->save();
            $m->delete();
        });
        Activity::log('delete', $m, 'إلغاء حركة مخزن: '.$item->name);

        return response()->json(['message' => 'تم إلغاء الحركة وإرجاع الكمية.', 'item' => $item->fresh(['category:id,name', 'location:id,name'])]);
    }

    public function dashboard(Request $request)
    {
        $items = InventoryItem::with('category:id,name')->get();
        $value = fn ($i) => (float) $i->quantity * (float) $i->unit_cost;
        $low = $items->filter(fn ($i) => $i->type === 'consumable' && (float) $i->min_quantity > 0 && (float) $i->quantity <= (float) $i->min_quantity);

        return response()->json([
            'items'        => $items->count(),
            'assets'       => $items->where('type', 'asset')->count(),
            'consumables'  => $items->where('type', 'consumable')->count(),
            'total_value'  => round($items->sum($value), 3),
            'low_count'    => $low->count(),
            'low'          => $low->sortBy('quantity')->take(10)->values()->map(fn ($i) => ['id' => $i->id, 'name' => $i->name, 'quantity' => $i->quantity, 'min_quantity' => $i->min_quantity, 'unit' => $i->unit]),
            'needs_repair' => $items->where('condition', 'needs_repair')->count(),
            'damaged'      => $items->where('condition', 'damaged')->count(),
            'by_category'  => $items->groupBy(fn ($i) => $i->category?->name ?? 'بدون فئة')->map(fn ($g, $k) => ['label' => $k, 'count' => $g->count(), 'value' => round($g->sum($value), 3)])->sortByDesc('value')->values(),
            'recent'       => InventoryMovement::with(self::WITH)->orderByDesc('id')->limit(10)->get(),
        ]);
    }
}
