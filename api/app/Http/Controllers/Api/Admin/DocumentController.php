<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\ResourceController;
use App\Http\Controllers\Concerns\HandlesUploads;
use App\Models\Document;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

/** Electronic archive: uploaded files with title/category. */
class DocumentController extends ResourceController
{
    use HandlesUploads;

    protected string $model = Document::class;

    protected array $search = ['title', 'category', 'notes'];

    protected array $filters = ['category'];

    protected array $with = ['uploader:id,name'];

    protected string $label = 'مستند';

    protected function rules(Request $request, ?Model $record): array
    {
        return [
            'title'    => [$record ? 'sometimes' : 'required', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:120'],
            'notes'    => ['nullable', 'string'],
            'file'     => [$record ? 'nullable' : 'required', 'file', 'max:20480'],
        ];
    }

    protected function prepare(array $data, Request $request, ?Model $record): array
    {
        if ($request->hasFile('file')) {
            $f = $request->file('file');
            if ($record) {
                $this->deleteImage($record->file);
            }
            $data['mime'] = $f->getClientMimeType();
            $data['size'] = $f->getSize();
            $data['file'] = $this->storeImage($f, 'archive');
        } else {
            unset($data['file']);
        }
        if (! $record) {
            $data['uploaded_by'] = $request->user()->id;
        }

        return $data;
    }

    public function categories()
    {
        return response()->json(Document::whereNotNull('category')->distinct()->orderBy('category')->pluck('category'));
    }

    protected function beforeDelete(Model $record): void
    {
        $this->deleteImage($record->file);
    }
}
