<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

trait HandlesUploads
{
    /** Only inert document/image types may be stored (never anything executable or HTML). */
    private array $allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt', 'zip'];

    /**
     * Store an uploaded file on the public disk and return its web path
     * (e.g. "/storage/archive/ab12.pdf"). Served by nginx via the /storage proxy.
     */
    protected function storeImage(UploadedFile $file, string $folder): string
    {
        $ext = strtolower($file->getClientOriginalExtension());
        if (! in_array($ext, $this->allowedExtensions, true)) {
            throw ValidationException::withMessages(['file' => ['نوع الملف غير مسموح. الأنواع المسموحة: '.implode('، ', $this->allowedExtensions)]]);
        }
        $name = Str::random(24).'.'.$ext;
        $file->storeAs($folder, $name, 'public');

        return '/storage/'.$folder.'/'.$name;
    }

    /** Delete a previously stored file given its web path. */
    protected function deleteImage(?string $webPath): void
    {
        if (! $webPath) {
            return;
        }
        $relative = ltrim(str_replace('/storage/', '', $webPath), '/');
        if ($relative && ! str_contains($relative, '..')) {
            Storage::disk('public')->delete($relative);
        }
    }
}
