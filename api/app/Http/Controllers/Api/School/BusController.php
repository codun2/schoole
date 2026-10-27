<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Api\ResourceController;
use App\Http\Controllers\Concerns\HandlesUploads;
use App\Models\Bus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class BusController extends ResourceController
{
    use HandlesUploads;

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
            'type_en'         => ['nullable', 'string', 'max:60'],
            'driver_name'     => ['nullable', 'string', 'max:120'],
            'driver_name_en'  => ['nullable', 'string', 'max:120'],
            'supervisor_name_en' => ['nullable', 'string', 'max:120'],
            'driver_phone'    => ['nullable', 'string', 'max:40'],
            'supervisor_name' => ['nullable', 'string', 'max:120'],
            'capacity'        => ['nullable', 'integer', 'min:0'],
            'price'           => ['nullable', 'numeric', 'min:0'],
            'route'           => ['nullable', 'string', 'max:255'],
            'route_en'        => ['nullable', 'string', 'max:255'],
            'photo'           => ['nullable', 'image', 'max:5120'], // optional bus photo (≤5MB)
            'remove_photo'    => ['nullable', 'boolean'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        unset($data['remove_photo']);
        if ($request->hasFile('photo')) {
            if ($record) {
                $this->deleteImage($record->photo);
            }
            $data['photo'] = $this->storeImage($request->file('photo'), 'buses');
        } else {
            unset($data['photo']);
            if ($record && $request->boolean('remove_photo')) {
                $this->deleteImage($record->photo);
                $data['photo'] = null;
            }
        }

        return $data;
    }

    protected function beforeDelete(Model $record): void
    {
        $this->deleteImage($record->photo);
    }

    /** Passenger manifest (for printing). */
    public function students(Request $request, $id)
    {
        $bus = $this->find($id);

        return response()->json([
            'bus'      => $bus,
            'students' => $bus->students()->with(['grade:id,name_ar,name_en', 'section:id,name,name_en', 'guardian:id,name,name_en,phone'])->orderBy('name')->get(),
        ]);
    }

    protected function cannotDelete(Model $record): ?string
    {
        return $record->students()->exists() ? 'لا يمكن حذف حافلة مسجّل عليها طلاب.' : null;
    }
}
