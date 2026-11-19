import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsPositive,
} from 'class-validator';
import { MAX_IMAGES_PER_OWNER } from '../../image/image-links';

export class ReorderImagesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMAGES_PER_OWNER)
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  imageIds: number[];
}
