//!!This script is for use within Google Earth Engine, so it must be used there. 
//!!This script uses three import variables that must be in Earth Engine's 'imports' section
//IMPORTS
//var Sent_2 = ee.ImageCollection("COPERNICUS/S2"),
//    roi = /* color: #98ff00 */ee.Geometry.Point([-33.00284840744821, 68.64449331362277]),
//    gbl_1 = /* color: #d63000 */ee.Geometry.Polygon(
//        [[[-33.5420664400674, 68.76967243725574],
//          [-33.411603793583026, 68.70842123723138],
//          [-33.304487094364276, 68.73383850014223],
//          [-33.320966586551776, 68.78905843301813]]]);
//where Sent_2 is the image collection, roi is the area of interest and the boundaries of the image region
//are defined by glb_1, glb_2, ...


//----------------------ATCORR FUNCTION-----------------------------------------
// Use this function to correct all the images in the collection, then you will
// need to use an iteration or map function to go through each image in that
// collection to calculate the surface area.
//------------------------------------------------------------------------------

// Area of Interest (AOI) and User parameters
// Sets up the entire region to have the desired cloud coverage, location,
// dates, etc
Map.setCenter(-33.00,68.64,9);
var glacier = ee.Geometry.Point(-33.00,68.64);
var polygon = glacier.buffer(20000).bounds();//
var start_date = '2016-05-01';
var end_date   = '2016-08-14';

var criteria = ee.Filter.and(
    ee.Filter.bounds(glacier), ee.Filter.date(start_date, end_date));
var cloud_perc = 10;//Max cloud percentile per scene.

var K_glacier = ee.ImageCollection(Sent_2)
                .filter(criteria)
                .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloud_perc));

//Function for mapping the correction across the entire image collection
function Sent2AtCorr(image) {

    // - Import the SIAC atmospheric correction module
    var siac = require('users/marcyinfeng/utils:SIAC');

    var S2_boa = siac.get_sur(image);
    return S2_boa;

}

//this is the data to be passed on to following functions
var Sent2_atCorr = K_glacier.map(Sent2AtCorr);
print(Sent2_atCorr);



//** method adapted from SIAC, <https://github.com/MarcYin/SIAC_GEE>, and
//   Yin, F., Lewis, P. E., Gomez-Dans, J., & Wu, Q. (2019, February 21).
//   A sensor-invariant atmospheric correction method: application to Sentinel-2/MSI and Landsat 8/OLI.
//   https://doi.org/10.31223/osf.io/ps957

//------------------------------------------------------------------------------
// Functions and settings for use in the iteration method whcih calculates the 
// Surface area of the lakes
//
//------------------------------------------------------------------------------

//create a list of the image collection images
var imageList = K_glacier.toList(K_glacier.size());
print(imageList);


//Function to create a mask function for the NDWI to get all water pixels
function h20mask(image) {
   return image.updateMask(image.gt(0.2));
}


//Function to determine the total area of lakes from all of the boundaries in the study area
function sumArea(arr) {
  var km_const = 1000000;
  var sum = 0;
  for(var i = 0; i < arr.length; i++) {
    var temporary = arr[i].getInfo();
    sum+= temporary['constant'];
  }
  return sum/km_const;
}

//------------------------------------------------------------------------------
// Mapping to clip the atmospherically corrected images to the glacier boundaries
// Since the server side cannot accompany user defined geometry in the iteration fucntion
// the images must be clipped to the specified boundaries first
//------------------------------------------------------------------------------

function img_clip(image) {
  return image.clip(gbl_1)
  
}

var sent2_atcor_clip = Sent2_atCorr.map(img_clip);


//----------------------------------------------------------------------------------------------
// ITERATION STEP
//
//----------------------------------------------------------------------------------------------
//the initial state of the object to be returned, an empty dictonary 
var SGLA_dict = ee.Dictionary({});

//function for the iterator
//the iterator takes in an argument for the current image and the result of the previous image

function calc_SGLA(current, previous) {
  
  
    var NDWI = current.expression(
      "(BLUE - RED) / (BLUE + RED)",
      {
      RED: current.select("B4"),    // RED
      NIR: current.select("B8"),    // NIR
      BLUE: current.select("B2")    // BLUE
      });

    //create a mask function for the NDWI to get all water pixels
    var h20_mask = h20mask(NDWI);

    //Using expression on the masked image to create binary 1 = water, 0 = not water
    var Sent_to2 = h20_mask.expression(
        '0 * S2', {
        'S2': h20_mask
        });

    var Sent_to3 = Sent_to2.expression(
        '1 + S2', {
        'S2': Sent_to2
        });

    //Generate the area and stats for the boundary area in the single image, add to an array of
    //boundary areas
    var S1_area = Sent_to3.multiply(ee.Image.pixelArea());

    var stats = S1_area.reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: gbl_1,
      scale: 10,
      tileScale: 16
      });
      

    // Get the timestamp and convert it to a date.
    var date = ee.Date(current.get('system:time_start'));

    //add the date/SA stats to the dictionary as a key value pair
    var last_dict = ee.Dictionary(previous);
    var updated = last_dict.set(ee.Date(date), stats);
    return updated;
    //return stats;
}

//the final result and the call to the iterator which takes the function and the initial state as
//the arguments
var result = ee.Dictionary(Sent2_atCorr.iterate(calc_SGLA, SGLA_dict));


print('result ', ee.Dictionary(result));



print(result.evaluate(function(result) {
                            print('Client-side operations to print all key-value pairs');
                            ee.Dictionary(result).keys().forEach(function(key) {
                            print('    ' + key + ': ' + result[key]);
                                });
                             }));





