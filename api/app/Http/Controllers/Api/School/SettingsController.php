<?php

namespace App\Http\Controllers\Api\School;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\HandlesUploads;
use Illuminate\Http\Request;

/** The school profile (tenant record) as edited by the school admin. */
class SettingsController extends Controller
{
    use HandlesUploads;

    public function show(Request $request)
    {
        return response()->json($request->user()->company->load('plan'));
    }

    public function update(Request $request)
    {
        $company = $request->user()->company;
        $data = $request->validate([
            'name'            => ['sometimes', 'string', 'max:255'],
            'name_en'         => ['nullable', 'string', 'max:255'],
            'phone'           => ['nullable', 'string', 'max:40'],
            'email'           => ['nullable', 'email'],
            'city'            => ['nullable', 'string', 'max:120'],
            'address'         => ['nullable', 'string', 'max:255'],
            'principal_name'  => ['nullable', 'string', 'max:255'],
            'cr_number'       => ['nullable', 'string', 'max:60'],
            'license_number'  => ['nullable', 'string', 'max:60'],
            'tax_number'      => ['nullable', 'string', 'max:60'],
            'currency'        => ['nullable', 'in:OMR,SAR,AED,KWD,QAR,BHD,JOD,EGP,USD'],
            'tax_rate'        => ['nullable', 'numeric', 'min:0', 'max:100'],
            'contract_prefix' => ['nullable', 'string', 'max:12', 'regex:/^[A-Za-z0-9]+$/'],
            'receipt_prefix'  => ['nullable', 'string', 'max:12', 'regex:/^[A-Za-z0-9]+$/'],
            'theme'           => ['nullable', 'in:indigo,emerald,rose,amber,sky,slate'],
            'settings'        => ['nullable', 'array'],
        ]);
        if (array_key_exists('settings', $data)) {
            $data['settings'] = array_merge($company->settings ?? [], $data['settings']); // merge so other keys (timetable config) survive
        }
        $company->update($data);

        return response()->json($company->fresh());
    }

    public function logo(Request $request)
    {
        $request->validate(['logo' => ['required', 'image', 'max:4096']]);
        $company = $request->user()->company;
        $this->deleteImage($company->logo);
        $company->update(['logo' => $this->storeImage($request->file('logo'), 'logos')]);

        return response()->json(['logo' => $company->logo]);
    }
}
