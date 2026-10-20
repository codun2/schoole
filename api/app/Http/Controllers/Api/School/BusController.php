<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Api\ResourceController;
use App\Models\Bus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class BusController extends ResourceController
{
    protected string $model = Bus::class;

    protected array $search = ['number', 'type', 'driver_name', 'driver_phone', 'route'];

    protected array $withCount = ['students'];

    protected bool $yearScoped = true;

    protected string $label = 'حافلة';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'number'          => [$record ? 'sometimes' : 'required', 'string', 'max:40'],
            'type'            => ['nullable', 'string', 'max:60'],
            'driver_name'     => ['nullable', 'string', 'max:120'],
            'driver_phone'    => ['nullable', 'string', 'max:40'],
            'supervisor_name' => ['nullable', 'string', 'max:120'],
            'capacity'        => ['nullable', 'integer', 'min:0'],
            'price'           => ['nullable', 'numeric', 'min:0'],
            'route'           => ['nullable', 'string', 'max:255'],
        ];
    }

    /** Passenger manifest (for printing). */
    public function students(Request $request, $id)
    {
        $bus = $this->find($id);

        return response()->json([
            'bus'      => $bus,
            'students' => $bus->students()->with(['grade:id,name_ar', 'section:id,name', 'guardian:id,name,phone'])->orderBy('name')->get(),
        ]);
    }

    protected function cannotDelete(Model $record): ?string
    {
        return $record->students()->exists() ? 'لا يمكن حذف حافلة مسجّل عليها طلاب.' : null;
    }
}
